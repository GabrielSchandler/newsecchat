/**
 * Fábrica de provedores de mensageria.
 *
 * Aqui está o único ponto do sistema que decide qual implementação
 * atende um canal. Acrescentar a Cloud API da Meta amanhã é escrever a
 * classe e somar um `case`.
 */
import { ambienteServidor, ErroConfiguracao } from '@/lib/ambiente';
import type { ProvedorMensageria as Contrato } from './contrato';
import { ProvedorEvolution } from './evolution';
import { ProvedorSimulado } from './simulado';
import type { ProvedorMensageria as NomeProvedor } from '@/lib/tipos-banco';

/** Instância única do simulado, para os testes lerem o que foi enviado. */
export const provedorSimulado = new ProvedorSimulado();

const cache = new Map<string, Contrato>();

export function obterProvedorMensageria(nome: NomeProvedor): Contrato {
  const emCache = cache.get(nome);
  if (emCache) return emCache;

  let provedor: Contrato;

  switch (nome) {
    case 'EVOLUTION': {
      if (!ambienteServidor.evolutionUrl || !ambienteServidor.evolutionChave) {
        throw new ErroConfiguracao(
          'Evolution API não configurada. Preencha EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.local. Passo a passo em OWNER_SETUP_GUIDE.md, seção EVOLUTION API.',
        );
      }
      provedor = new ProvedorEvolution({
        url: ambienteServidor.evolutionUrl,
        chave: ambienteServidor.evolutionChave,
      });
      break;
    }

    case 'SIMULADO':
      provedor = provedorSimulado;
      break;

    case 'META_CLOUD':
      throw new ErroConfiguracao(
        'O provedor Meta Cloud API ainda não foi implementado. Use EVOLUTION neste canal.',
      );

    default: {
      const naoTratado: never = nome;
      throw new Error(`Provedor de mensageria desconhecido: ${String(naoTratado)}`);
    }
  }

  cache.set(nome, provedor);
  return provedor;
}

export type { ProvedorMensageria as ContratoMensageria } from './contrato';
export * from './contrato';
