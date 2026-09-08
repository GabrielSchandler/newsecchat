/**
 * Processamento de mídia recebida.
 *
 * Baixa do provedor, guarda no armazenamento e — conforme o tipo —
 * transcreve o áudio ou descreve a imagem/documento. Só depois disso a IA
 * é acionada: sem esse cuidado, ela responderia "não entendi" a um áudio
 * que ainda estava sendo transcrito.
 *
 * Sobre documentos: o sistema descreve o que o arquivo APARENTA conter.
 * Em nenhuma hipótese afirma autenticidade — isso não é verificável por
 * leitura de imagem, e afirmar seria mentir para o atendente.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import { obterProvedorTranscricao } from '@/lib/provedores/transcricao/indice';
import { obterProvedorIa } from '@/lib/provedores/ia/indice';
import { obterProvedorArmazenamento } from '@/lib/provedores/armazenamento/indice';
import { enfileirar } from '@/lib/filas/produtor';
import { FILAS, type TrabalhoMidia } from '@/lib/filas/nomes';
import { log } from '@/lib/log';

/** Teto de download. Acima disso o arquivo fica só como anexo. */
const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

const INSTRUCAO_IMAGEM = `
Descreva objetivamente o que aparece nesta imagem, em português do Brasil, em até 4 linhas.

Se parecer um documento, diga que TIPO de documento aparenta ser e quais campos estão visíveis.
Nunca afirme que o documento é autêntico, válido ou verdadeiro — isso não é verificável por imagem.
Não transcreva números de documento, cartão ou conta por extenso.
Se a imagem estiver ilegível, diga isso.
`.trim();

export async function processarMidia(trabalho: TrabalhoMidia): Promise<void> {
  const supabase = clienteAdministrador();
  const registro = log.comContexto({
    organizacao_id: trabalho.organizacaoId,
    mensagem_id: trabalho.mensagemId,
  });

  const { data: arquivo, error } = await supabase
    .from('arquivos')
    .select('*')
    .eq('id', trabalho.arquivoId)
    .eq('organizacao_id', trabalho.organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler arquivo: ${error.message}`);
  if (!arquivo) {
    registro.warn('Arquivo não encontrado; nada a processar');
    return;
  }

  // Já baixado: reprocessamento não baixa de novo.
  if (!arquivo.caminho) {
    const { data: canal } = await supabase
      .from('canais')
      .select('*')
      .eq('id', trabalho.canalId)
      .eq('organizacao_id', trabalho.organizacaoId)
      .maybeSingle();

    if (!canal) {
      await falhar(trabalho.arquivoId, 'Canal não encontrado');
      await acionarIa(trabalho);
      return;
    }

    try {
      const provedor = obterProvedorMensageria(canal.provedor);
      const conteudo = await provedor.baixarMidia(
        {
          id: canal.id,
          organizacao_id: canal.organizacao_id,
          identificador_externo: canal.identificador_externo,
        },
        {
          tipo: 'DOCUMENTO',
          tipoMime: arquivo.tipo_mime,
          nomeArquivo: arquivo.nome_arquivo,
          tamanhoBytes: arquivo.tamanho_bytes,
          duracaoSegundos: arquivo.duracao_segundos,
          referencia: trabalho.referenciaMidia,
        },
      );

      if (conteudo.byteLength > TAMANHO_MAXIMO_BYTES) {
        await falhar(
          trabalho.arquivoId,
          `Arquivo de ${(conteudo.byteLength / 1024 / 1024).toFixed(1)} MB acima do limite de 25 MB`,
        );
        await acionarIa(trabalho);
        return;
      }

      const guardado = await obterProvedorArmazenamento().guardar({
        organizacaoId: trabalho.organizacaoId,
        conteudo,
        nomeArquivo: arquivo.nome_arquivo ?? `${trabalho.referenciaMidia}.bin`,
        tipoMime: arquivo.tipo_mime ?? 'application/octet-stream',
      });

      await supabase
        .from('arquivos')
        .update({
          caminho: guardado.caminho,
          tamanho_bytes: guardado.tamanhoBytes,
          erro_processamento: null,
        })
        .eq('id', trabalho.arquivoId);

      arquivo.caminho = guardado.caminho;
      registro.info('Mídia guardada', { arquivo_id: trabalho.arquivoId });
    } catch (erro) {
      const descricao = erro instanceof Error ? erro.message : String(erro);
      await falhar(trabalho.arquivoId, descricao);
      registro.error('Falha ao baixar mídia', { erro: descricao });
      // A conversa não pode parar por causa de um anexo.
      await acionarIa(trabalho);
      return;
    }
  }

  if (arquivo.status_transcricao === 'PENDENTE') {
    await transcrever(trabalho, arquivo.caminho as string, arquivo.tipo_mime, arquivo.nome_arquivo);
  }

  if (arquivo.status_analise === 'PENDENTE') {
    await analisar(trabalho, arquivo.caminho as string, arquivo.tipo_mime);
  }

  await acionarIa(trabalho);
}

async function transcrever(
  trabalho: TrabalhoMidia,
  caminho: string,
  tipoMime: string | null,
  nomeArquivo: string | null,
): Promise<void> {
  const supabase = clienteAdministrador();
  const provedor = obterProvedorTranscricao();

  if (!provedor.disponivel) {
    await supabase
      .from('arquivos')
      .update({
        status_transcricao: 'FALHOU',
        erro_processamento: 'Transcrição indisponível: provedor de IA não configurado.',
      })
      .eq('id', trabalho.arquivoId);
    return;
  }

  await supabase
    .from('arquivos')
    .update({ status_transcricao: 'PROCESSANDO' })
    .eq('id', trabalho.arquivoId);

  try {
    const conteudo = await obterProvedorArmazenamento().baixar(caminho);
    const resultado = await provedor.transcrever({
      conteudo,
      nomeArquivo: nomeArquivo ?? 'audio.ogg',
      tipoMime: tipoMime ?? 'audio/ogg',
      idioma: 'pt',
    });

    const texto = resultado.texto.trim();

    await supabase
      .from('arquivos')
      .update({ transcricao: texto, status_transcricao: 'CONCLUIDO' })
      .eq('id', trabalho.arquivoId);

    // A transcrição entra no conteúdo da mensagem: é o que a IA lê e o que
    // o atendente vê sem precisar ouvir o áudio.
    if (texto) {
      await supabase
        .from('mensagens')
        .update({ conteudo: texto, metadados: { transcrito: true } })
        .eq('id', trabalho.mensagemId)
        .eq('organizacao_id', trabalho.organizacaoId);

      await supabase
        .from('conversas')
        .update({ ultima_mensagem_previa: `🎤 ${texto.slice(0, 150)}` })
        .eq('id', (await conversaDaMensagem(trabalho)) ?? '')
        .eq('organizacao_id', trabalho.organizacaoId);
    }

    log.info('Áudio transcrito', {
      organizacao_id: trabalho.organizacaoId,
      mensagem_id: trabalho.mensagemId,
      caracteres: texto.length,
    });
  } catch (erro) {
    const descricao = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from('arquivos')
      .update({ status_transcricao: 'FALHOU', erro_processamento: descricao })
      .eq('id', trabalho.arquivoId);

    log.error('Falha ao transcrever áudio', {
      organizacao_id: trabalho.organizacaoId,
      erro: descricao,
    });
  }
}

async function analisar(
  trabalho: TrabalhoMidia,
  caminho: string,
  tipoMime: string | null,
): Promise<void> {
  const supabase = clienteAdministrador();

  // Só imagem tem leitura visual. PDF fica registrado como anexo, e o
  // atendente abre — extrair texto de PDF exige biblioteca própria e está
  // anotado como próximo passo.
  if (!tipoMime?.startsWith('image/')) {
    await supabase
      .from('arquivos')
      .update({ status_analise: 'NAO_APLICAVEL' })
      .eq('id', trabalho.arquivoId);
    return;
  }

  await supabase
    .from('arquivos')
    .update({ status_analise: 'PROCESSANDO' })
    .eq('id', trabalho.arquivoId);

  try {
    const conteudo = await obterProvedorArmazenamento().baixar(caminho);
    const resposta = await obterProvedorIa().descreverImagem({
      imagemBase64: conteudo.toString('base64'),
      tipoMime,
      instrucao: INSTRUCAO_IMAGEM,
    });

    await supabase
      .from('arquivos')
      .update({ descricao_analise: resposta.conteudo.trim(), status_analise: 'CONCLUIDO' })
      .eq('id', trabalho.arquivoId);

    const { data: mensagem } = await supabase
      .from('mensagens')
      .select('conteudo')
      .eq('id', trabalho.mensagemId)
      .maybeSingle();

    // A descrição entra como contexto, marcada como leitura automática —
    // nunca como se fosse texto escrito pelo cliente.
    const legenda = mensagem?.conteudo ? `${mensagem.conteudo}\n\n` : '';
    await supabase
      .from('mensagens')
      .update({
        conteudo: `${legenda}[Leitura automática da imagem] ${resposta.conteudo.trim()}`,
        metadados: { imagem_analisada: true },
      })
      .eq('id', trabalho.mensagemId)
      .eq('organizacao_id', trabalho.organizacaoId);
  } catch (erro) {
    const descricao = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from('arquivos')
      .update({ status_analise: 'FALHOU', erro_processamento: descricao })
      .eq('id', trabalho.arquivoId);

    log.error('Falha ao analisar imagem', {
      organizacao_id: trabalho.organizacaoId,
      erro: descricao,
    });
  }
}

async function conversaDaMensagem(trabalho: TrabalhoMidia): Promise<string | null> {
  const { data } = await clienteAdministrador()
    .from('mensagens')
    .select('conversa_id')
    .eq('id', trabalho.mensagemId)
    .maybeSingle();

  return data?.conversa_id ?? null;
}

async function falhar(arquivoId: string, motivo: string): Promise<void> {
  await clienteAdministrador()
    .from('arquivos')
    .update({
      erro_processamento: motivo,
      status_transcricao: 'FALHOU',
      status_analise: 'FALHOU',
    })
    .eq('id', arquivoId);
}

/** Depois da mídia, a IA responde — se a conversa ainda for dela. */
async function acionarIa(trabalho: TrabalhoMidia): Promise<void> {
  const supabase = clienteAdministrador();

  const conversaId = await conversaDaMensagem(trabalho);
  if (!conversaId) return;

  const { data: conversa } = await supabase
    .from('conversas')
    .select('estado, canal_id')
    .eq('id', conversaId)
    .eq('organizacao_id', trabalho.organizacaoId)
    .maybeSingle();

  if (!conversa || conversa.estado !== 'IA') return;

  const { data: canal } = await supabase
    .from('canais')
    .select('ia_ativa')
    .eq('id', conversa.canal_id)
    .maybeSingle();

  if (!canal?.ia_ativa) return;

  await enfileirar(
    FILAS.processamentoIa,
    {
      conversaId,
      mensagemGatilhoId: trabalho.mensagemId,
      organizacaoId: trabalho.organizacaoId,
    },
    { id: `ia:${trabalho.mensagemId}` },
  );
}
