/**
 * Envio de mensagem.
 *
 * O envio tem sempre duas etapas separadas, e isso é proposital:
 *
 *   1. GRAVAR a mensagem como PENDENTE, com chave de idempotência.
 *   2. ENFILEIRAR o despacho.
 *
 * Se o processo cair entre uma e outra, a mensagem fica registrada como
 * pendente e é recuperada pela varredura — nada some. Se dois trabalhos
 * chegarem para a mesma mensagem, só um consegue reservá-la no banco; o
 * outro sai sem mandar nada. O cliente nunca recebe a mesma frase duplicada por
 * falha de infraestrutura.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { BancoDados, Canal, Mensagem, TipoMensagem } from '@/lib/tipos-banco';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import { ErroProvedorMensageria, type MidiaParaEnvio } from '@/lib/provedores/mensageria/contrato';
import { enfileirar, FILAS } from '@/lib/filas/produtor';
import { log } from '@/lib/log';

const execFileAsync = promisify(execFile);

type Cliente = SupabaseClient<BancoDados>;

const CODIGO_DUPLICADO = '23505';

export interface PedidoMensagemSaida {
  organizacaoId: string;
  conversaId: string;
  contatoId: string;
  canalId: string;
  autor: 'IA' | 'ATENDENTE' | 'SISTEMA';
  autorMembroId?: string | null;
  tipo?: TipoMensagem;
  conteudo: string | null;
  arquivoId?: string | null;
  chaveIdempotencia: string;
  campanhaId?: string | null;
  metadados?: Record<string, unknown>;
  /**
   * Nome de quem assina a mensagem no WhatsApp — o nome de exibição da IA
   * ou o nome do atendente que respondeu. Sem isso, a mensagem sai sem
   * prefixo de nome (é o caso de campanha e de mensagem de sistema).
   */
  remetenteNome?: string | null;
}

export interface ResultadoCriacaoSaida {
  mensagemId: string | null;
  /** true quando a mesma chave já havia sido gravada. */
  jaExistia: boolean;
}

export async function criarMensagemSaida(
  cliente: Cliente,
  pedido: PedidoMensagemSaida,
): Promise<ResultadoCriacaoSaida> {
  const { data, error } = await cliente
    .from('mensagens')
    .insert({
      organizacao_id: pedido.organizacaoId,
      conversa_id: pedido.conversaId,
      contato_id: pedido.contatoId,
      canal_id: pedido.canalId,
      direcao: 'SAIDA',
      autor: pedido.autor,
      autor_membro_id: pedido.autorMembroId ?? null,
      tipo: pedido.tipo ?? 'TEXTO',
      conteudo: pedido.conteudo,
      arquivo_id: pedido.arquivoId ?? null,
      chave_idempotencia: pedido.chaveIdempotencia,
      campanha_id: pedido.campanhaId ?? null,
      status: 'PENDENTE',
      metadados: (pedido.metadados ?? {}) as never,
      remetente_nome: pedido.remetenteNome ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === CODIGO_DUPLICADO) {
      const { data: existente } = await cliente
        .from('mensagens')
        .select('id')
        .eq('organizacao_id', pedido.organizacaoId)
        .eq('chave_idempotencia', pedido.chaveIdempotencia)
        .maybeSingle();

      return { mensagemId: existente?.id ?? null, jaExistia: true };
    }
    throw new Error(`Falha ao gravar mensagem de saída: ${error.message}`);
  }

  return { mensagemId: data.id, jaExistia: false };
}

/** Grava e já enfileira o despacho. É o caminho usado pela interface. */
export async function enviarMensagem(
  cliente: Cliente,
  pedido: PedidoMensagemSaida,
): Promise<ResultadoCriacaoSaida> {
  const resultado = await criarMensagemSaida(cliente, pedido);

  if (resultado.mensagemId && !resultado.jaExistia) {
    await cliente
      .from('conversas')
      .update({
        ultima_mensagem_em: new Date().toISOString(),
        ultima_mensagem_previa: (pedido.conteudo ?? 'Mensagem').slice(0, 160),
        nao_lidas: 0,
      })
      .eq('id', pedido.conversaId)
      .eq('organizacao_id', pedido.organizacaoId);

    await enfileirar(
      FILAS.mensagensEnviadas,
      { mensagemId: resultado.mensagemId, organizacaoId: pedido.organizacaoId },
      { id: `envio:${resultado.mensagemId}` },
    );
  }

  return resultado;
}

export interface ResultadoDespacho {
  status: 'ENVIADA' | 'FALHOU' | 'IGNORADA';
  motivo?: string;
}

/**
 * Por quanto tempo a mensagem fica reservada para um despacho. Folga
 * larga sobre o tempo limite da chamada à Evolution (20 s): se o worker
 * cair no meio do envio, a reserva vence sozinha e a mensagem volta a
 * poder sair.
 */
const PRAZO_RESERVA_SEGUNDOS = 120;

/**
 * Entrega de fato ao provedor. Roda no worker.
 *
 * Antes de chamar o provedor, a mensagem é RESERVADA no banco por um
 * UPDATE condicional. Dois trabalhos para a mesma mensagem — o normal e o
 * da varredura de recuperação, por exemplo — não reservam juntos: um
 * envia, o outro sai sem fazer nada. Só conferir o status e depois enviar
 * deixaria os dois lerem PENDENTE ao mesmo tempo, e o cliente receberia a
 * mesma frase duas vezes.
 */
export async function despacharMensagem(
  cliente: Cliente,
  mensagemId: string,
  organizacaoId: string,
): Promise<ResultadoDespacho> {
  const registro = log.comContexto({ organizacao_id: organizacaoId, mensagem_id: mensagemId });

  const { data: reservadas, error } = await cliente.rpc('reservar_despacho_mensagem', {
    p_mensagem_id: mensagemId,
    p_organizacao_id: organizacaoId,
    p_segundos: PRAZO_RESERVA_SEGUNDOS,
  });

  if (error) throw new Error(`Falha ao reservar a mensagem para despacho: ${error.message}`);

  const mensagem = reservadas?.[0];

  if (!mensagem) {
    return explicarDespachoIgnorado(cliente, mensagemId, organizacaoId, registro);
  }

  const { data: canal } = await cliente
    .from('canais')
    .select('*')
    .eq('id', mensagem.canal_id)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!canal) {
    await marcarFalha(cliente, mensagem, 'Canal não encontrado');
    return { status: 'FALHOU', motivo: 'Canal não encontrado' };
  }

  const { data: contato } = await cliente
    .from('contatos')
    .select('telefone, bloqueado')
    .eq('id', mensagem.contato_id)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!contato) {
    await marcarFalha(cliente, mensagem, 'Contato não encontrado');
    return { status: 'FALHOU', motivo: 'Contato não encontrado' };
  }

  if (contato.bloqueado) {
    await marcarFalha(cliente, mensagem, 'Contato bloqueado');
    return { status: 'FALHOU', motivo: 'Contato bloqueado' };
  }

  try {
    const provedor = obterProvedorMensageria(canal.provedor);
    const canalEnvio = {
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      identificador_externo: canal.identificador_externo,
    };

    const resposta =
      mensagem.tipo === 'TEXTO' || !mensagem.arquivo_id
        ? await provedor.enviarTexto(
            canalEnvio,
            contato.telefone,
            formatarParaEnvio(mensagem.remetente_nome, mensagem.conteudo ?? ''),
          )
        : await provedor.enviarMidia(
            canalEnvio,
            contato.telefone,
            await montarMidia(cliente, mensagem, organizacaoId),
          );

    await cliente
      .from('mensagens')
      .update({
        status: 'ENVIADA',
        identificador_externo: resposta.identificadorExterno,
        enviado_em: resposta.enviadoEm,
        erro: null,
        despacho_reservado_ate: null,
      })
      .eq('id', mensagem.id)
      .eq('organizacao_id', organizacaoId);

    registro.info('Mensagem entregue ao provedor', { provedor: canal.provedor });
    return { status: 'ENVIADA' };
  } catch (erro) {
    const permanente = erro instanceof ErroProvedorMensageria ? erro.permanente : false;
    const descricao = erro instanceof Error ? erro.message : String(erro);

    if (permanente) {
      await marcarFalha(cliente, mensagem, descricao);
      registro.error('Envio falhou de forma permanente', { erro: descricao });
      return { status: 'FALHOU', motivo: descricao };
    }

    // Erro temporário: devolve a reserva, deixa PENDENTE e deixa a fila
    // tentar de novo.
    await cliente
      .from('mensagens')
      .update({ erro: descricao, despacho_reservado_ate: null })
      .eq('id', mensagem.id)
      .eq('organizacao_id', organizacaoId);

    throw erro;
  }
}

/** Quando a reserva não vem, diz por quê — no log e no resultado. */
async function explicarDespachoIgnorado(
  cliente: Cliente,
  mensagemId: string,
  organizacaoId: string,
  registro: ReturnType<typeof log.comContexto>,
): Promise<ResultadoDespacho> {
  const { data: atual } = await cliente
    .from('mensagens')
    .select('status')
    .eq('id', mensagemId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!atual) return { status: 'IGNORADA', motivo: 'Mensagem não encontrada' };

  const motivo =
    atual.status === 'PENDENTE' || atual.status === 'ENFILEIRADA'
      ? 'Outro trabalho está despachando esta mensagem agora'
      : `Mensagem já está ${atual.status}`;

  registro.info('Despacho ignorado', { motivo });
  return { status: 'IGNORADA', motivo };
}

async function marcarFalha(cliente: Cliente, mensagem: Mensagem, motivo: string): Promise<void> {
  await cliente
    .from('mensagens')
    .update({ status: 'FALHOU', erro: motivo, despacho_reservado_ate: null })
    .eq('id', mensagem.id)
    .eq('organizacao_id', mensagem.organizacao_id);
}

/**
 * Converte áudio para ogg/opus mono, ~16 kbps — o formato que o WhatsApp
 * exige para tocar como nota de voz (bolha com forma de onda). Enviado
 * em outro formato, a Evolution aceita normalmente, mas o áudio chega ao
 * cliente como arquivo anexado comum, sem a bolha.
 *
 * Se o arquivo já é ogg/opus (ex.: um áudio de WhatsApp encaminhado),
 * passa direto — reencodar de novo só perderia qualidade à toa.
 *
 * Só roda no worker: é lá que o Dockerfile instala o ffmpeg (ver
 * Dockerfile.worker). Esta função nunca é chamada a partir da Vercel —
 * `montarMidia`, quem chama, só executa dentro de `despacharMensagem`,
 * que só o worker invoca.
 */
async function transcodificarParaNotaDeVoz(
  conteudo: Buffer,
  tipoMimeOriginal: string,
): Promise<Buffer> {
  if (/ogg/i.test(tipoMimeOriginal) && /opus/i.test(tipoMimeOriginal)) {
    return conteudo;
  }

  const pasta = await mkdtemp(join(tmpdir(), 'audio-'));
  const entrada = join(pasta, 'entrada');
  const saida = join(pasta, 'saida.ogg');

  try {
    await writeFile(entrada, conteudo);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      entrada,
      '-c:a',
      'libopus',
      '-ac',
      '1',
      '-b:a',
      '16k',
      '-vn',
      saida,
    ]);
    return await readFile(saida);
  } catch (erro) {
    throw new ErroProvedorMensageria(
      `Não foi possível converter o áudio para nota de voz: ${erro instanceof Error ? erro.message : String(erro)}`,
      { provedor: 'INTERNO', permanente: true },
    );
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

async function montarMidia(
  cliente: Cliente,
  mensagem: Mensagem,
  organizacaoId: string,
): Promise<MidiaParaEnvio> {
  const { data: arquivo } = await cliente
    .from('arquivos')
    .select('*')
    .eq('id', mensagem.arquivo_id ?? '')
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!arquivo?.caminho) {
    throw new ErroProvedorMensageria('Arquivo da mensagem não encontrado.', {
      provedor: 'INTERNO',
      permanente: true,
    });
  }

  const { obterProvedorArmazenamento } = await import('@/lib/provedores/armazenamento/indice');
  const baixado = await obterProvedorArmazenamento().baixar(arquivo.caminho);

  // Áudio gravado pelo atendente na própria tela chega aqui como
  // webm/opus (o que o MediaRecorder do navegador produz) — o WhatsApp só
  // toca como nota de voz de verdade se o arquivo for ogg/opus.
  const conteudo =
    mensagem.tipo === 'AUDIO'
      ? await transcodificarParaNotaDeVoz(baixado, arquivo.tipo_mime ?? '')
      : baixado;

  const tipo = mensagem.tipo === 'STICKER' ? 'IMAGEM' : mensagem.tipo;

  return {
    tipo: tipo as MidiaParaEnvio['tipo'],
    base64: conteudo.toString('base64'),
    nomeArquivo: mensagem.tipo === 'AUDIO' ? 'audio.ogg' : (arquivo.nome_arquivo ?? 'arquivo'),
    tipoMime: mensagem.tipo === 'AUDIO' ? 'audio/ogg; codecs=opus' : (arquivo.tipo_mime ?? 'application/octet-stream'),
    // Só assina a legenda quando existe legenda: mídia sem legenda
    // continua sem legenda, em vez de ganhar uma só para caber o nome.
    legenda: mensagem.conteudo
      ? formatarParaEnvio(mensagem.remetente_nome, mensagem.conteudo)
      : undefined,
  };
}

/**
 * Prefixa o texto com o nome de quem está falando, em negrito no padrão
 * do WhatsApp — um asterisco de cada lado ("*Ana*"). Dois asteriscos
 * (padrão Markdown) aparecem literalmente na tela do cliente, sem
 * formatar nada: o WhatsApp usa sintaxe própria, não Markdown.
 *
 * Aplicado aqui, na hora do envio — nunca pedido à IA no prompt — para
 * ficar consistente sempre, sem depender do modelo lembrar de formatar
 * certo em toda resposta. `mensagem.conteudo` (o que fica gravado e o
 * que a IA lê no histórico) permanece sem o prefixo; só o texto que sai
 * para o WhatsApp ganha o "*Nome*\n\n" na frente.
 *
 * Sem remetente (mensagem de sistema ou de campanha), o texto sai como
 * foi escrito, sem prefixo nem mudança de caixa.
 */
function formatarParaEnvio(remetenteNome: string | null | undefined, conteudo: string): string {
  if (!conteudo) return conteudo;

  const comMaiuscula = conteudo.charAt(0).toUpperCase() + conteudo.slice(1);
  if (!remetenteNome) return comMaiuscula;

  return `*${remetenteNome}*\n\n${comMaiuscula}`;
}

/** Canal pronto para enviar? Usado pela interface antes de oferecer a ação. */
export function canalPodeEnviar(canal: Pick<Canal, 'status' | 'ativo'>): boolean {
  return canal.ativo && canal.status === 'CONECTADO';
}
