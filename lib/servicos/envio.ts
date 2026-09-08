/**
 * Envio de mensagem.
 *
 * O envio tem sempre duas etapas separadas, e isso é proposital:
 *
 *   1. GRAVAR a mensagem como PENDENTE, com chave de idempotência.
 *   2. ENFILEIRAR o despacho.
 *
 * Se o processo cair entre uma e outra, a mensagem fica registrada como
 * pendente e é recuperada pela varredura — nada some. Se a fila entregar
 * o mesmo trabalho duas vezes, a segunda encontra a mensagem já ENVIADA e
 * não manda de novo. O cliente nunca recebe a mesma frase duplicada por
 * falha de infraestrutura.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BancoDados, Canal, Mensagem, TipoMensagem } from '@/lib/tipos-banco';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import { ErroProvedorMensageria, type MidiaParaEnvio } from '@/lib/provedores/mensageria/contrato';
import { enfileirar, FILAS } from '@/lib/filas/produtor';
import { log } from '@/lib/log';

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
 * Entrega de fato ao provedor. Roda no worker.
 *
 * Só age sobre mensagem PENDENTE ou ENFILEIRADA: uma segunda entrega do
 * mesmo trabalho encontra ENVIADA e sai sem fazer nada.
 */
export async function despacharMensagem(
  cliente: Cliente,
  mensagemId: string,
  organizacaoId: string,
): Promise<ResultadoDespacho> {
  const registro = log.comContexto({ organizacao_id: organizacaoId, mensagem_id: mensagemId });

  const { data: mensagem, error } = await cliente
    .from('mensagens')
    .select('*')
    .eq('id', mensagemId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler mensagem: ${error.message}`);
  if (!mensagem) return { status: 'IGNORADA', motivo: 'Mensagem não encontrada' };

  if (mensagem.status !== 'PENDENTE' && mensagem.status !== 'ENFILEIRADA') {
    registro.info('Despacho ignorado: mensagem já não está pendente', {
      status: mensagem.status,
    });
    return { status: 'IGNORADA', motivo: `Mensagem já está ${mensagem.status}` };
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
        ? await provedor.enviarTexto(canalEnvio, contato.telefone, mensagem.conteudo ?? '')
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

    // Erro temporário: deixa PENDENTE e deixa a fila tentar de novo.
    await cliente
      .from('mensagens')
      .update({ erro: descricao })
      .eq('id', mensagem.id)
      .eq('organizacao_id', organizacaoId);

    throw erro;
  }
}

async function marcarFalha(cliente: Cliente, mensagem: Mensagem, motivo: string): Promise<void> {
  await cliente
    .from('mensagens')
    .update({ status: 'FALHOU', erro: motivo })
    .eq('id', mensagem.id)
    .eq('organizacao_id', mensagem.organizacao_id);
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
  const conteudo = await obterProvedorArmazenamento().baixar(arquivo.caminho);

  const tipo = mensagem.tipo === 'STICKER' ? 'IMAGEM' : mensagem.tipo;

  return {
    tipo: tipo as MidiaParaEnvio['tipo'],
    base64: conteudo.toString('base64'),
    nomeArquivo: arquivo.nome_arquivo ?? 'arquivo',
    tipoMime: arquivo.tipo_mime ?? 'application/octet-stream',
    legenda: mensagem.conteudo ?? undefined,
  };
}

/** Canal pronto para enviar? Usado pela interface antes de oferecer a ação. */
export function canalPodeEnviar(canal: Pick<Canal, 'status' | 'ativo'>): boolean {
  return canal.ativo && canal.status === 'CONECTADO';
}
