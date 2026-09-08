/**
 * Conexão com o Redis e criação das filas.
 *
 * Duas observações que economizam depuração:
 *
 * 1. `maxRetriesPerRequest: null` é exigência do BullMQ. Sem isso o
 *    ioredis derruba comandos bloqueantes e o worker para de consumir sem
 *    dizer por quê.
 * 2. Sem REDIS_URL a aplicação NÃO quebra. Ela entra em modo de fila em
 *    memória (só desenvolvimento) ou recusa o enfileiramento com
 *    mensagem clara — o que nunca acontece é a mensagem sumir em silêncio.
 */
import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { ambienteServidor } from '@/lib/ambiente';
import { log } from '@/lib/log';
import { FILAS, POLITICA_TENTATIVAS, type NomeFila } from './nomes';

let conexao: Redis | null = null;

export function redisDisponivel(): boolean {
  return Boolean(ambienteServidor.redisUrl);
}

export function obterConexaoRedis(): Redis {
  if (!ambienteServidor.redisUrl) {
    throw new Error(
      'REDIS_URL não configurada. Ver OWNER_SETUP_GUIDE.md, seção REDIS. Para desenvolvimento sem Redis, use FILA_EM_MEMORIA=true.',
    );
  }

  if (!conexao) {
    conexao = new IORedis(ambienteServidor.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    conexao.on('error', (erro) => {
      log.error('Erro na conexão com o Redis', { erro: erro.message });
    });
  }

  return conexao;
}

const filas = new Map<NomeFila, Queue>();

export function obterFila(nome: NomeFila): Queue {
  const existente = filas.get(nome);
  if (existente) return existente;

  const politica = POLITICA_TENTATIVAS[nome];

  const fila = new Queue(nome, {
    connection: obterConexaoRedis(),
    defaultJobOptions: {
      attempts: politica.tentativas,
      backoff: { type: 'exponential', delay: politica.esperaBaseMs },
      // Guardar os concluídos para sempre enche o Redis. Mil registros é
      // o suficiente para conferir o que acabou de acontecer.
      removeOnComplete: { count: 1000 },
      // Falha fica mais tempo: é o que se investiga.
      removeOnFail: { count: 5000 },
    } satisfies JobsOptions,
  });

  filas.set(nome, fila);
  return fila;
}

export async function fecharFilas(): Promise<void> {
  for (const fila of filas.values()) {
    await fila.close();
  }
  filas.clear();

  if (conexao) {
    await conexao.quit();
    conexao = null;
  }
}

export { FILAS };
