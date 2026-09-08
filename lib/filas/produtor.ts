/**
 * Enfileiramento de trabalho.
 *
 * Todo mundo que precisa mandar algo para segundo plano chama daqui.
 * A escolha entre Redis e fila em memória acontece neste ponto, e em
 * nenhum outro.
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

export function modoFila(): 'REDIS' | 'MEMORIA' | 'INDISPONIVEL' {
  if (redisDisponivel()) return 'REDIS';
  if (ambienteServidor.filaEmMemoria) return 'MEMORIA';
  return 'INDISPONIVEL';
}

export async function enfileirar<F extends NomeFila>(
  fila: F,
  dados: MapaTrabalhos[F],
  opcoes: OpcoesEnfileiramento = {},
): Promise<void> {
  const modo = modoFila();

  if (modo === 'REDIS') {
    await obterFila(fila).add(fila, dados, {
      // O jobId estável é a segunda camada de idempotência: mesmo que a
      // chamada aconteça duas vezes, o BullMQ ignora o duplicado.
      jobId: opcoes.id,
      delay: opcoes.atrasoMs,
    });
    return;
  }

  if (modo === 'MEMORIA') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FILA_EM_MEMORIA não é permitida em produção. Configure REDIS_URL — ver OWNER_SETUP_GUIDE.md, seção REDIS.',
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
    return;
  }

  throw new Error(
    'Nenhuma fila configurada. Preencha REDIS_URL no .env.local (produção) ou FILA_EM_MEMORIA=true (desenvolvimento). Ver OWNER_SETUP_GUIDE.md, seção REDIS.',
  );
}

/**
 * Enfileira sem derrubar quem chamou.
 *
 * Usado no webhook: se a fila estiver fora do ar, o evento JÁ está gravado
 * em `eventos_webhook` com status RECEBIDO e é recuperado depois pela
 * varredura do worker. Devolver erro 500 para a Evolution aqui só faria
 * ela reentregar o mesmo evento em cima de um sistema já em dificuldade.
 */
export async function enfileirarTolerante<F extends NomeFila>(
  fila: F,
  dados: MapaTrabalhos[F],
  opcoes: OpcoesEnfileiramento = {},
): Promise<boolean> {
  try {
    await enfileirar(fila, dados, opcoes);
    return true;
  } catch (erro) {
    log.error('Não foi possível enfileirar o trabalho; ficará para a varredura', {
      fila,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return false;
  }
}

export { FILAS };
