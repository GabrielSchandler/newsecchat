/**
 * Processamento de um evento de webhook já gravado.
 *
 * Este é o ponto onde a mensagem vira contato, conversa e histórico. Roda
 * fora da requisição HTTP, com a chave de serviço, e é idempotente de
 * ponta a ponta: reprocessar o mesmo evento não cria nada duas vezes.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import type { EventoNormalizado } from '@/lib/provedores/mensageria/contrato';
import {
  atualizarConversaAposMensagem,
  gravarMensagemRecebida,
  previaDaMensagem,
  resolverContato,
  resolverConversaAberta,
} from '@/lib/servicos/conversas';
import { iaPodeResponder } from '@/lib/nucleo/estados';
import { enfileirar } from '@/lib/filas/produtor';
import { FILAS, type TrabalhoEventoWebhook } from '@/lib/filas/nomes';
import { log } from '@/lib/log';
import type { Canal, StatusMensagem } from '@/lib/tipos-banco';

export async function processarEventoWebhook(trabalho: TrabalhoEventoWebhook): Promise<void> {
  const supabase = clienteAdministrador();

  const { data: evento, error } = await supabase
    .from('eventos_webhook')
    .select('*')
    .eq('id', trabalho.eventoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler o evento: ${error.message}`);
  if (!evento) {
    log.warn('Evento de webhook não encontrado', { evento_id: trabalho.eventoId });
    return;
  }

  // Reprocessamento de evento já concluído não faz nada.
  if (evento.status === 'PROCESSADO' || evento.status === 'IGNORADO') {
    log.info('Evento já processado; nada a fazer', {
      evento_id: evento.id,
      organizacao_id: evento.organizacao_id,
    });
    return;
  }

  if (!evento.canal_id || !evento.organizacao_id) {
    await marcar(evento.id, 'IGNORADO', 'Evento sem canal ou organização');
    return;
  }

  const { data: canal } = await supabase
    .from('canais')
    .select('*')
    .eq('id', evento.canal_id)
    .maybeSingle();

  if (!canal) {
    await marcar(evento.id, 'IGNORADO', 'Canal não existe mais');
    return;
  }

  const provedor = obterProvedorMensageria(canal.provedor);
  const normalizado = provedor.interpretarEvento(evento.carga);

  try {
    switch (normalizado.tipo) {
      case 'MENSAGEM_RECEBIDA':
        await processarMensagem(canal, normalizado);
        break;
      case 'STATUS_MENSAGEM':
        await processarStatusMensagem(canal, normalizado);
        break;
      case 'STATUS_CONEXAO':
        await processarStatusConexao(canal, normalizado);
        break;
      case 'IGNORADO':
        await marcar(evento.id, 'IGNORADO', normalizado.motivo);
        return;
    }

    await marcar(evento.id, 'PROCESSADO', null);
  } catch (erro) {
    const descricao = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from('eventos_webhook')
      .update({ status: 'FALHOU', erro: descricao, tentativas: evento.tentativas + 1 })
      .eq('id', evento.id);
    throw erro;
  }
}

async function marcar(
  eventoId: string,
  status: 'PROCESSADO' | 'IGNORADO',
  motivo: string | null,
): Promise<void> {
  await clienteAdministrador()
    .from('eventos_webhook')
    .update({ status, erro: motivo, processado_em: new Date().toISOString() })
    .eq('id', eventoId);
}

async function processarMensagem(
  canal: Canal,
  evento: Extract<EventoNormalizado, { tipo: 'MENSAGEM_RECEBIDA' }>,
): Promise<void> {
  const supabase = clienteAdministrador();
  const registro = log.comContexto({
    organizacao_id: canal.organizacao_id,
    canal_id: canal.id,
  });

  // Mensagem que o próprio número enviou (ex.: o atendente respondeu pelo
  // celular). Entra no histórico para a tela ficar fiel, mas não aciona a
  // IA — senão ela responderia à própria empresa.
  const contato = await resolverContato(
    supabase,
    canal.organizacao_id,
    { telefone: evento.telefone, nomeExibicao: evento.nomeExibicao, origem: 'WHATSAPP' },
    canal,
  );

  if (contato.bloqueado) {
    registro.info('Mensagem de contato bloqueado; ignorada', { contato_id: contato.id });
    return;
  }

  const conversa = await resolverConversaAberta(supabase, canal, contato);

  if (evento.doProprioNumero) {
    await gravarMensagemRecebida(supabase, {
      organizacaoId: canal.organizacao_id,
      conversaId: conversa.id,
      contatoId: contato.id,
      canalId: canal.id,
      tipo: evento.tipoMensagem,
      conteudo: evento.texto,
      identificadorExterno: evento.identificadorEvento,
      recebidoEm: evento.recebidoEm,
      metadados: { origem: 'ECO_DO_PROPRIO_NUMERO' },
    });
    registro.info('Mensagem do próprio número registrada no histórico', {
      conversa_id: conversa.id,
    });
    return;
  }

  let arquivoId: string | null = null;

  if (evento.midia) {
    const { data: arquivo, error: erroArquivo } = await supabase
      .from('arquivos')
      .insert({
        organizacao_id: canal.organizacao_id,
        contato_id: contato.id,
        nome_arquivo: evento.midia.nomeArquivo,
        tipo_mime: evento.midia.tipoMime,
        tamanho_bytes: evento.midia.tamanhoBytes,
        duracao_segundos: evento.midia.duracaoSegundos,
        status_transcricao: evento.midia.tipo === 'AUDIO' ? 'PENDENTE' : 'NAO_APLICAVEL',
        status_analise:
          evento.midia.tipo === 'IMAGEM' || evento.midia.tipo === 'DOCUMENTO'
            ? 'PENDENTE'
            : 'NAO_APLICAVEL',
      })
      .select('id')
      .single();

    if (erroArquivo) throw new Error(`Falha ao registrar arquivo: ${erroArquivo.message}`);
    arquivoId = arquivo.id;
  }

  const { mensagemId, duplicada } = await gravarMensagemRecebida(supabase, {
    organizacaoId: canal.organizacao_id,
    conversaId: conversa.id,
    contatoId: contato.id,
    canalId: canal.id,
    tipo: evento.tipoMensagem,
    conteudo: evento.texto,
    arquivoId,
    identificadorExterno: evento.identificadorEvento,
    recebidoEm: evento.recebidoEm,
  });

  if (duplicada || !mensagemId) {
    registro.info('Mensagem duplicada; processamento encerrado', { conversa_id: conversa.id });
    return;
  }

  const estadoDepois = await atualizarConversaAposMensagem(
    supabase,
    conversa,
    previaDaMensagem(evento.tipoMensagem, evento.texto),
    evento.recebidoEm,
  );

  // Resposta a uma campanha: marca o lead como recuperado e amarra a
  // conversa à campanha de origem.
  await supabase.rpc('registrar_resposta_campanha', {
    p_conversa_id: conversa.id,
    p_contato_id: contato.id,
  });

  // Mídia primeiro: a transcrição do áudio precisa existir antes de a IA
  // montar o contexto, senão ela responde a uma mensagem "sem texto".
  if (arquivoId && evento.midia) {
    await enfileirar(
      FILAS.processamentoMidia,
      {
        arquivoId,
        mensagemId,
        canalId: canal.id,
        organizacaoId: canal.organizacao_id,
        referenciaMidia: evento.midia.referencia,
      },
      { id: `midia:${arquivoId}` },
    );
    registro.info('Mídia enfileirada para processamento', { conversa_id: conversa.id });
    return;
  }

  if (iaPodeResponder(estadoDepois) && canal.ia_ativa) {
    await enfileirar(
      FILAS.processamentoIa,
      {
        conversaId: conversa.id,
        mensagemGatilhoId: mensagemId,
        organizacaoId: canal.organizacao_id,
      },
      { id: `ia:${mensagemId}` },
    );
  }

  registro.info('Mensagem recebida processada', {
    conversa_id: conversa.id,
    estado: estadoDepois,
  });
}

async function processarStatusMensagem(
  canal: Canal,
  evento: Extract<EventoNormalizado, { tipo: 'STATUS_MENSAGEM' }>,
): Promise<void> {
  const supabase = clienteAdministrador();

  // O status só avança: uma confirmação de entrega que chega atrasada não
  // pode rebaixar uma mensagem já marcada como lida.
  const ordem: Record<StatusMensagem, number> = {
    PENDENTE: 0,
    ENFILEIRADA: 1,
    ENVIADA: 2,
    ENTREGUE: 3,
    LIDA: 4,
    FALHOU: 5,
  };

  const { data: mensagem } = await supabase
    .from('mensagens')
    .select('id, status')
    .eq('organizacao_id', canal.organizacao_id)
    .eq('identificador_externo', evento.identificadorMensagem)
    .maybeSingle();

  if (!mensagem) return;

  const atual = ordem[mensagem.status] ?? 0;
  const novo = ordem[evento.status] ?? 0;

  if (novo <= atual) return;

  await supabase
    .from('mensagens')
    .update({ status: evento.status })
    .eq('id', mensagem.id)
    .eq('organizacao_id', canal.organizacao_id);
}

async function processarStatusConexao(
  canal: Canal,
  evento: Extract<EventoNormalizado, { tipo: 'STATUS_CONEXAO' }>,
): Promise<void> {
  const supabase = clienteAdministrador();

  const atualizacao: Partial<Canal> = {
    status: evento.status,
    ultimo_erro: evento.status === 'ERRO' ? 'O provedor relatou erro de conexão' : null,
  };

  if (evento.status === 'CONECTADO') {
    atualizacao.ultima_conexao_em = new Date().toISOString();
    if (evento.telefone) atualizacao.telefone = evento.telefone;
  }

  if (evento.qrCodeBase64) {
    const anterior =
      canal.configuracao && typeof canal.configuracao === 'object' && !Array.isArray(canal.configuracao)
        ? canal.configuracao
        : {};

    atualizacao.configuracao = {
      ...anterior,
      qrcode: evento.qrCodeBase64,
      qrcode_em: new Date().toISOString(),
    };
  }

  await supabase.from('canais').update(atualizacao).eq('id', canal.id);

  log.info('Status do canal atualizado', {
    organizacao_id: canal.organizacao_id,
    canal_id: canal.id,
    status: evento.status,
  });
}
