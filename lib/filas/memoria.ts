/**
 * Fila em memória — SOMENTE desenvolvimento.
 *
 * Serve para rodar a aplicação inteira sem subir Redis: o trabalho é
 * enfileirado e processado fora do ciclo da requisição, então o webhook
 * continua respondendo rápido, que é a regra que importa.
 *
 * O que ela NÃO faz, e por isso não serve em produção:
 * - não sobrevive a reinício do processo (trabalho pendente se perde);
 * - não é compartilhada entre instâncias;
 * - em ambiente serverless (Vercel), o processo pode congelar assim que a
 *   resposta HTTP sai, e o trabalho nunca roda.
 *
 * Por isso ela se recusa a ligar com NODE_ENV=production.
 */
import { log } from '@/lib/log';
import type { NomeFila } from './nomes';

type Processador = (dados: unknown) => Promise<void>;

interface ItemFila {
  fila: NomeFila;
  dados: unknown;
  tentativa: number;
  executarEm: number;
}

const processadores = new Map<NomeFila, Processador>();
const pendentes: ItemFila[] = [];
let rodando = false;

export function registrarProcessadorEmMemoria(fila: NomeFila, processador: Processador): void {
  processadores.set(fila, processador);
}

export function processadoresRegistrados(): number {
  return processadores.size;
}

export function enfileirarEmMemoria(fila: NomeFila, dados: unknown, atrasoMs = 0): void {
  pendentes.push({ fila, dados, tentativa: 0, executarEm: Date.now() + atrasoMs });
  void girar();
}

async function girar(): Promise<void> {
  if (rodando) return;
  rodando = true;

  try {
    while (pendentes.length > 0) {
      const agora = Date.now();
      const indice = pendentes.findIndex((item) => item.executarEm <= agora);

      if (indice === -1) {
        // Nada pronto: espera o mais próximo em vez de girar em vazio.
        const proximo = Math.min(...pendentes.map((item) => item.executarEm));
        await new Promise((resolver) => setTimeout(resolver, Math.max(50, proximo - agora)));
        continue;
      }

      const [item] = pendentes.splice(indice, 1);
      if (!item) continue;

      const processador = processadores.get(item.fila);
      if (!processador) {
        log.warn('Trabalho descartado: nenhum processador registrado para a fila', {
          fila: item.fila,
        });
        continue;
      }

      try {
        await processador(item.dados);
      } catch (erro) {
        const tentativa = item.tentativa + 1;
        if (tentativa < 3) {
          pendentes.push({
            ...item,
            tentativa,
            executarEm: Date.now() + 2000 * 2 ** tentativa,
          });
          log.warn('Trabalho falhou, será repetido', {
            fila: item.fila,
            tentativa,
            erro: erro instanceof Error ? erro.message : String(erro),
          });
        } else {
          log.error('Trabalho falhou definitivamente na fila em memória', {
            fila: item.fila,
            erro: erro instanceof Error ? erro.message : String(erro),
          });
        }
      }
    }
  } finally {
    rodando = false;
  }
}

/** Usado nos testes para esperar a fila esvaziar. */
export async function aguardarFilaEmMemoria(limiteMs = 5000): Promise<void> {
  const limite = Date.now() + limiteMs;
  while ((pendentes.length > 0 || rodando) && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
}
