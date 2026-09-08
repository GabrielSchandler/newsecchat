/**
 * Worker das filas.
 *
 * Roda como processo separado (VPS/Docker), nunca na Vercel: função
 * serverless não segura conexão bloqueante com Redis nem sobrevive a um
 * trabalho de dois minutos.
 *
 * Além de consumir as filas, ele mantém três rotinas de manutenção:
 *
 * - varredura de eventos de webhook que ficaram para trás (a fila pode
 *   ter estado fora do ar quando a mensagem chegou);
 * - varredura de mensagens pendentes de envio;
 * - sincronização periódica das planilhas.
 *
 * Sem essas varreduras, uma queda de Redis de dez minutos deixaria
 * mensagens de cliente sem resposta para sempre — e ninguém saberia.
 */
import { Worker, type Job } from 'bullmq';
import { obterConexaoRedis, fecharFilas } from '@/lib/filas/conexao';
import { enfileirarTolerante } from '@/lib/filas/produtor';
import { FILAS, POLITICA_TENTATIVAS, type NomeFila } from '@/lib/filas/nomes';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { ambienteServidor } from '@/lib/ambiente';
import { log } from '@/lib/log';
import { PROCESSADORES } from './registro';
import type { Json } from '@/lib/tipos-banco';

/** Quantos trabalhos por fila em paralelo. */
const CONCORRENCIA: Record<NomeFila, number> = {
  [FILAS.eventosWebhook]: 8,
  [FILAS.mensagensEnviadas]: 4,
  [FILAS.processamentoIa]: 4,
  [FILAS.processamentoMidia]: 2,
  // Campanha é 1 de propósito: o intervalo entre envios é a razão de ela
  // existir como fila, e paralelizar destruiria o espaçamento.
  [FILAS.campanhas]: 1,
  [FILAS.sincronizacaoPlanilhas]: 1,
  [FILAS.analiseIa]: 1,
};

const INTERVALO_VARREDURA_MS = 60_000;

const trabalhadores: Worker[] = [];
let encerrando = false;

function criarTrabalhador(nome: NomeFila): Worker {
  const processador = PROCESSADORES[nome] as (dados: unknown) => Promise<void>;

  const trabalhador = new Worker(
    nome,
    async (trabalho: Job) => {
      const inicio = Date.now();
      await processador(trabalho.data);
      log.debug('Trabalho concluído', {
        fila: nome,
        trabalho_id: trabalho.id,
        duracao_ms: Date.now() - inicio,
      });
    },
    {
      connection: obterConexaoRedis(),
      concurrency: CONCORRENCIA[nome],
    },
  );

  trabalhador.on('failed', (trabalho, erro) => {
    const tentativas = trabalho?.attemptsMade ?? 0;
    const limite = POLITICA_TENTATIVAS[nome].tentativas;

    log.error('Trabalho falhou', {
      fila: nome,
      trabalho_id: trabalho?.id,
      tentativa: tentativas,
      limite,
      erro: erro.message,
    });

    // Esgotou as tentativas: registra para alguém olhar. Trabalho perdido
    // em silêncio é o pior desfecho possível.
    if (tentativas >= limite) {
      void registrarFalha(nome, trabalho, erro);
    }
  });

  trabalhador.on('error', (erro) => {
    log.error('Erro no worker', { fila: nome, erro: erro.message });
  });

  return trabalhador;
}

async function registrarFalha(fila: NomeFila, trabalho: Job | undefined, erro: Error): Promise<void> {
  try {
    const dados = (trabalho?.data ?? {}) as Record<string, unknown>;
    const organizacaoId =
      typeof dados.organizacaoId === 'string' ? dados.organizacaoId : null;

    await clienteAdministrador().from('falhas_trabalho').insert({
      organizacao_id: organizacaoId,
      fila,
      nome_trabalho: trabalho?.name ?? fila,
      identificador_trabalho: trabalho?.id ?? null,
      dados: dados as Json,
      erro: erro.message,
      tentativas: trabalho?.attemptsMade ?? 0,
    });
  } catch (falha) {
    log.error('Não foi possível registrar a falha do trabalho', {
      fila,
      erro: falha instanceof Error ? falha.message : String(falha),
    });
  }
}

// ---------------------------------------------------------------------
// Varreduras de recuperação
// ---------------------------------------------------------------------

async function varrerEventosPendentes(): Promise<void> {
  const { data, error } = await clienteAdministrador()
    .from('eventos_webhook')
    .select('id')
    .in('status', ['RECEBIDO', 'FALHOU'])
    .lt('tentativas', 5)
    .lt('recebido_em', new Date(Date.now() - 30_000).toISOString())
    .order('recebido_em', { ascending: true })
    .limit(100);

  if (error) {
    log.error('Falha na varredura de eventos', { erro: error.message });
    return;
  }

  for (const evento of data ?? []) {
    await enfileirarTolerante(
      FILAS.eventosWebhook,
      { eventoId: evento.id },
      { id: `evento:${evento.id}` },
    );
  }

  if (data?.length) {
    log.info('Eventos atrasados reenfileirados', { total: data.length });
  }
}

async function varrerMensagensPendentes(): Promise<void> {
  const { data, error } = await clienteAdministrador()
    .from('mensagens')
    .select('id, organizacao_id')
    .eq('direcao', 'SAIDA')
    .in('status', ['PENDENTE', 'ENFILEIRADA'])
    .lt('criado_em', new Date(Date.now() - 120_000).toISOString())
    .order('criado_em', { ascending: true })
    .limit(100);

  if (error) {
    log.error('Falha na varredura de mensagens', { erro: error.message });
    return;
  }

  for (const mensagem of data ?? []) {
    await enfileirarTolerante(
      FILAS.mensagensEnviadas,
      { mensagemId: mensagem.id, organizacaoId: mensagem.organizacao_id },
      { id: `envio:${mensagem.id}:reenvio` },
    );
  }

  if (data?.length) {
    log.info('Mensagens pendentes reenfileiradas', { total: data.length });
  }
}

async function varrerPlanilhas(): Promise<void> {
  const { data, error } = await clienteAdministrador()
    .from('integracoes_google_sheets')
    .select('id, organizacao_id, intervalo_minutos, ultima_sincronizacao_em')
    .eq('ativo', true);

  if (error) {
    log.error('Falha na varredura de planilhas', { erro: error.message });
    return;
  }

  const agora = Date.now();

  for (const planilha of data ?? []) {
    const ultima = planilha.ultima_sincronizacao_em
      ? new Date(planilha.ultima_sincronizacao_em).getTime()
      : 0;

    if (agora - ultima < planilha.intervalo_minutos * 60_000) continue;

    await enfileirarTolerante(
      FILAS.sincronizacaoPlanilhas,
      { integracaoSheetsId: planilha.id, organizacaoId: planilha.organizacao_id },
      { id: `planilha:${planilha.id}:${Math.floor(agora / 60_000)}` },
    );
  }
}

async function varrerCampanhasEmExecucao(): Promise<void> {
  // Campanha que ficou sem trabalho na fila (queda do worker, por exemplo)
  // volta a andar sozinha aqui.
  const { data, error } = await clienteAdministrador()
    .from('campanhas')
    .select('id, organizacao_id')
    .eq('status', 'EM_EXECUCAO');

  if (error) {
    log.error('Falha na varredura de campanhas', { erro: error.message });
    return;
  }

  for (const campanha of data ?? []) {
    await enfileirarTolerante(
      FILAS.campanhas,
      { campanhaId: campanha.id, organizacaoId: campanha.organizacao_id },
      { id: `campanha:${campanha.id}:retomada:${Math.floor(Date.now() / 300_000)}` },
    );
  }
}

async function ciclarVarreduras(): Promise<void> {
  while (!encerrando) {
    try {
      await varrerEventosPendentes();
      await varrerMensagensPendentes();
      await varrerPlanilhas();
      await varrerCampanhasEmExecucao();
    } catch (erro) {
      log.error('Falha no ciclo de varredura', {
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }

    await new Promise((resolver) => setTimeout(resolver, INTERVALO_VARREDURA_MS));
  }
}

// ---------------------------------------------------------------------
// Início e encerramento
// ---------------------------------------------------------------------

async function encerrar(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;

  log.info('Encerrando o worker', { sinal });

  // `close()` espera o trabalho em andamento terminar. Cortar no meio
  // deixaria mensagem gravada como pendente sem ninguém para retomá-la
  // antes da próxima varredura.
  await Promise.all(trabalhadores.map((trabalhador) => trabalhador.close()));
  await fecharFilas();

  log.info('Worker encerrado');
  process.exit(0);
}

function principal(): void {
  if (!ambienteServidor.redisUrl) {
    process.stderr.write(
      '\n  O worker precisa de REDIS_URL no .env.local.\n' +
        '  Passo a passo em OWNER_SETUP_GUIDE.md, seção REDIS.\n\n',
    );
    process.exit(1);
  }

  if (!ambienteServidor.supabaseChaveServico) {
    process.stderr.write(
      '\n  O worker precisa de SUPABASE_SERVICE_ROLE_KEY no .env.local.\n' +
        '  Passo a passo em OWNER_SETUP_GUIDE.md, seção SUPABASE.\n\n',
    );
    process.exit(1);
  }

  for (const nome of Object.keys(PROCESSADORES) as NomeFila[]) {
    trabalhadores.push(criarTrabalhador(nome));
  }

  log.info('Worker iniciado', {
    filas: Object.keys(PROCESSADORES).join(', '),
    ia_configurada: Boolean(ambienteServidor.openaiChave),
    evolution_configurada: Boolean(ambienteServidor.evolutionUrl),
  });

  void ciclarVarreduras();

  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

principal();
