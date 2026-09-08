/**
 * Registro central dos processadores.
 *
 * Existe para que a mesma tabela "fila → função" sirva aos dois modos de
 * execução: BullMQ (produção) e fila em memória (desenvolvimento sem
 * Redis). Sem isso, os dois caminhos divergiriam com o tempo e o que
 * funciona em desenvolvimento deixaria de valer em produção.
 */
import { FILAS, type MapaTrabalhos, type NomeFila } from '@/lib/filas/nomes';
import { registrarProcessadorEmMemoria } from '@/lib/filas/memoria';
import { processarEventoWebhook } from './processadores/evento-webhook';
import { processarEnvio } from './processadores/envio';
import { processarTurnoIa } from './processadores/ia';
import { processarMidia } from './processadores/midia';
import { processarCampanha } from './processadores/campanha';
import { processarPlanilha } from './processadores/planilha';
import { processarAnaliseIa } from './processadores/analise-ia';

type Processador<F extends NomeFila> = (dados: MapaTrabalhos[F]) => Promise<void>;

export const PROCESSADORES: { [F in NomeFila]: Processador<F> } = {
  [FILAS.eventosWebhook]: processarEventoWebhook,
  [FILAS.mensagensEnviadas]: processarEnvio,
  [FILAS.processamentoIa]: processarTurnoIa,
  [FILAS.processamentoMidia]: processarMidia,
  [FILAS.campanhas]: processarCampanha,
  [FILAS.sincronizacaoPlanilhas]: processarPlanilha,
  [FILAS.analiseIa]: processarAnaliseIa,
};

export function registrarProcessadoresEmMemoria(): void {
  for (const nome of Object.keys(PROCESSADORES) as NomeFila[]) {
    const processador = PROCESSADORES[nome] as (dados: unknown) => Promise<void>;
    registrarProcessadorEmMemoria(nome, processador);
  }
}
