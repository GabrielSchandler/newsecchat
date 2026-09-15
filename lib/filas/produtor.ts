/**
 * Enfileiramento de trabalho.
 *
 * Todo mundo que precisa mandar algo para segundo plano chama daqui. A
 * escolha do caminho acontece neste ponto, e em nenhum outro:
 *
 * - REDIS   — o processo fala direto com a fila. É o caso do worker.
 * - MEMORIA — desenvolvimento sem Redis, tudo no mesmo processo.
 * - BANCO   — o processo não tem Redis. É o caso da Vercel. O chamador já
 *             gravou o trabalho no banco (evento RECEBIDO, mensagem
 *             PENDENTE, análise PENDENTE, campanha EM_EXECUCAO) e a
 *             varredura do worker o busca em poucos segundos.
 *
 * Por que a Vercel não fala com o Redis: função serverless não tem IP
 * fixo, então alcançar um Redis próprio exigiria deixá-lo aberto para a
 * internet; e um Redis gerenciado gratuito não aguenta os comandos que
 * sete filas gastam só esperando trabalho. O banco já é a fonte da
 * verdade — usá-lo como caixa de entrada do worker tira uma peça do
 * caminho.
 */
import { ambienteServidor } from '@/lib/ambiente';
import { log } from '@/lib/log';
import { obterFila, redisDisponivel } from './conexao';
import { enfileirarEmMemoria, processadoresRegistrados } from './memoria';
import { FILAS, type MapaTrabalhos, type NomeFila } from './nomes';

export interface OpcoesEnfileiramento {
  /** Identificador estável do trabalho. Reenfileirar o mesmo id não duplica. */
  id?: string;
  atrasoMs?: number;
}

export type ModoFila = 'REDIS' | 'MEMORIA' | 'BANCO';

/**
 * ENFILEIRADO — o trabalho entrou na fila agora.
 * DELEGADO    — não há fila neste processo; o worker vai buscar no banco.
 */
export type ResultadoEnfileiramento = 'ENFILEIRADO' | 'DELEGADO';

/**
 * Filas cujo trabalho deixa rastro no banco que a varredura do worker sabe
 * achar. Só essas podem ser delegadas: as outras (turno de IA, mídia)
 * nascem dentro do próprio worker, e delegá-las seria perdê-las em
 * silêncio.
 */
const FILAS_DELEGAVEIS: ReadonlySet<NomeFila> = new Set<NomeFila>([
  FILAS.eventosWebhook,
  FILAS.mensagensEnviadas,
  FILAS.campanhas,
  FILAS.sincronizacaoPlanilhas,
  FILAS.analiseIa,
]);

export function modoFila(): ModoFila {
  if (redisDisponivel()) return 'REDIS';
  if (ambienteServidor.filaEmMemoria) return 'MEMORIA';
  return 'BANCO';
}

export async function enfileirar<F extends NomeFila>(
  fila: F,
  dados: MapaTrabalhos[F],
  opcoes: OpcoesEnfileiramento = {},
): Promise<ResultadoEnfileiramento> {
  const modo = modoFila();

  if (modo === 'REDIS') {
    await obterFila(fila).add(fila, dados, {
      // O jobId estável é a segunda camada de idempotência: mesmo que a
      // chamada aconteça duas vezes, o BullMQ ignora o duplicado.
      //
      // O BullMQ 5 recusa ":" no jobId customizado ("Custom Id cannot
      // contain :") porque usa esse caractere para montar a própria chave
      // no Redis. Todo id vindo dos chamadores segue o esquema
      // "prefixo:id" (ver DECISOES-TECNICAS.md, seção 3), então sem essa
      // troca nenhuma mensagem entra na fila — foi assim que a primeira
      // conversa de teste travou: o webhook gravava o evento, mas o
      // enfileiramento caía com esse erro, sem nada tocar o worker.
      jobId: opcoes.id?.replaceAll(':', '_'),
      delay: opcoes.atrasoMs,
    });
    return 'ENFILEIRADO';
  }

  if (modo === 'MEMORIA') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FILA_EM_MEMORIA não é permitida em produção. Remova a variável: sem Redis, o trabalho fica gravado no banco e o worker o busca.',
      );
    }

    if (processadoresRegistrados() === 0) {
      // Carrega os processadores sob demanda. Import dinâmico de
      // propósito: se fosse estático, a aplicação web arrastaria o
      // worker inteiro para dentro do build.
      const { registrarProcessadoresEmMemoria } = await import('@/trabalhador/registro');
      registrarProcessadoresEmMemoria();
    }

    enfileirarEmMemoria(fila, dados, opcoes.atrasoMs ?? 0);
    return 'ENFILEIRADO';
  }

  if (!FILAS_DELEGAVEIS.has(fila)) {
    throw new Error(
      `A fila "${fila}" só existe dentro do worker e precisa de REDIS_URL. Este processo não tem fila configurada.`,
    );
  }

  log.debug('Sem fila neste processo; o worker buscará o trabalho no banco', { fila });
  return 'DELEGADO';
}

/**
 * Enfileira sem derrubar quem chamou. Devolve true só quando o trabalho
 * entrou na fila AGORA.
 *
 * Usado no webhook: se não entrou — fila fora do ar ou processo sem fila —
 * o evento continua RECEBIDO no banco e a varredura do worker o recupera.
 * Devolver erro 500 para a Evolution só faria ela reentregar o mesmo
 * evento em cima de um sistema já em dificuldade.
 */
export async function enfileirarTolerante<F extends NomeFila>(
  fila: F,
  dados: MapaTrabalhos[F],
  opcoes: OpcoesEnfileiramento = {},
): Promise<boolean> {
  try {
    return (await enfileirar(fila, dados, opcoes)) === 'ENFILEIRADO';
  } catch (erro) {
    log.error('Não foi possível enfileirar o trabalho; ficará para a varredura', {
      fila,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return false;
  }
}

export { FILAS };
