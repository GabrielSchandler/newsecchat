/**
 * Fábrica do provedor de IA.
 *
 * Sem chave configurada, cai no simulado em vez de derrubar a aplicação:
 * o atendimento humano continua funcionando e a conversa é encaminhada
 * para uma pessoa, que é o comportamento correto quando a IA não está
 * disponível.
 */
import { ambienteServidor, integracaoConfigurada } from '@/lib/ambiente';
import type { ProvedorIa } from './contrato';
import { ProvedorOpenAI } from './openai';
import { ProvedorIaSimulado } from './simulado';

export const provedorIaSimulado = new ProvedorIaSimulado();

let instancia: ProvedorIa | null = null;

export function obterProvedorIa(): ProvedorIa {
  if (instancia) return instancia;

  if (!integracaoConfigurada('IA')) {
    instancia = provedorIaSimulado;
    return instancia;
  }

  switch (ambienteServidor.provedorIa) {
    case 'OPENAI':
    default:
      instancia = new ProvedorOpenAI({ chave: ambienteServidor.openaiChave });
      return instancia;
  }
}

/** Usado nos testes para forçar o provedor. */
export function _definirProvedorIa(provedor: ProvedorIa | null): void {
  instancia = provedor;
}

export * from './contrato';
