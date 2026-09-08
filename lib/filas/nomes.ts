/**
 * Nomes das filas e formato de cada trabalho.
 *
 * Ficam num arquivo separado porque tanto quem produz (aplicação web)
 * quanto quem consome (worker) precisam do mesmo contrato — e nenhum dos
 * dois deve importar o código do outro.
 */

export const FILAS = {
  eventosWebhook: 'eventos-webhook',
  mensagensEnviadas: 'mensagens-enviadas',
  processamentoIa: 'processamento-ia',
  processamentoMidia: 'processamento-midia',
  campanhas: 'campanhas',
  sincronizacaoPlanilhas: 'sincronizacao-planilhas',
  analiseIa: 'analise-ia',
} as const;

export type NomeFila = (typeof FILAS)[keyof typeof FILAS];

export interface TrabalhoEventoWebhook {
  eventoId: string;
}

export interface TrabalhoEnvioMensagem {
  mensagemId: string;
  organizacaoId: string;
}

export interface TrabalhoIa {
  conversaId: string;
  mensagemGatilhoId: string;
  organizacaoId: string;
}

export interface TrabalhoMidia {
  arquivoId: string;
  mensagemId: string;
  canalId: string;
  organizacaoId: string;
  referenciaMidia: string;
}

export interface TrabalhoCampanha {
  campanhaId: string;
  organizacaoId: string;
}

export interface TrabalhoPlanilha {
  integracaoSheetsId: string;
  organizacaoId: string;
}

export interface TrabalhoAnaliseIa {
  execucaoId: string;
  organizacaoId: string;
}

export interface MapaTrabalhos {
  [FILAS.eventosWebhook]: TrabalhoEventoWebhook;
  [FILAS.mensagensEnviadas]: TrabalhoEnvioMensagem;
  [FILAS.processamentoIa]: TrabalhoIa;
  [FILAS.processamentoMidia]: TrabalhoMidia;
  [FILAS.campanhas]: TrabalhoCampanha;
  [FILAS.sincronizacaoPlanilhas]: TrabalhoPlanilha;
  [FILAS.analiseIa]: TrabalhoAnaliseIa;
}

/**
 * Política de repetição por fila.
 *
 * Nenhuma fila repete para sempre: depois das tentativas, o trabalho vai
 * para `falhas_trabalho` e alguém decide o que fazer. Fila que repete sem
 * limite entope e esconde o defeito.
 */
export const POLITICA_TENTATIVAS: Record<NomeFila, { tentativas: number; esperaBaseMs: number }> = {
  [FILAS.eventosWebhook]: { tentativas: 5, esperaBaseMs: 2000 },
  [FILAS.mensagensEnviadas]: { tentativas: 4, esperaBaseMs: 5000 },
  [FILAS.processamentoIa]: { tentativas: 3, esperaBaseMs: 5000 },
  [FILAS.processamentoMidia]: { tentativas: 3, esperaBaseMs: 10000 },
  [FILAS.campanhas]: { tentativas: 2, esperaBaseMs: 15000 },
  [FILAS.sincronizacaoPlanilhas]: { tentativas: 3, esperaBaseMs: 30000 },
  [FILAS.analiseIa]: { tentativas: 2, esperaBaseMs: 30000 },
};
