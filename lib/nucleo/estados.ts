/**
 * Máquina de estados da conversa.
 *
 * A regra que não se quebra: **quando um humano assume, a IA cala**. Ela
 * só volta a falar depois de uma ação explícita de devolução.
 *
 * Este arquivo é a versão em TypeScript da mesma regra que o banco aplica
 * nas funções `assumir_conversa()` e `registrar_mensagem_ia()`. Ter as
 * duas não é redundância inútil: aqui a interface decide o que oferecer ao
 * operador; lá o banco garante o resultado sob concorrência, que é onde a
 * corrida realmente acontece.
 */

export const ESTADOS = [
  'IA',
  'AGUARDANDO_HUMANO',
  'HUMANO',
  'AGUARDANDO_CLIENTE',
  'ENCERRADA',
] as const;

export type EstadoConversa = (typeof ESTADOS)[number];

export const rotuloEstado: Record<EstadoConversa, string> = {
  IA: 'IA atendendo',
  AGUARDANDO_HUMANO: 'Aguardando humano',
  HUMANO: 'Em atendimento',
  AGUARDANDO_CLIENTE: 'Aguardando cliente',
  ENCERRADA: 'Encerrada',
};

export type AcaoConversa =
  | 'MENSAGEM_DO_CLIENTE'
  | 'IA_RESPONDEU'
  | 'IA_PEDIU_HUMANO'
  | 'HUMANO_ASSUMIU'
  | 'HUMANO_RESPONDEU'
  | 'DEVOLVER_PARA_IA'
  | 'TRANSFERIR_DEPARTAMENTO'
  | 'ENCERRAR'
  | 'REABRIR_PARA_HUMANO'
  | 'REABRIR_PARA_IA';

/** Transições permitidas. O que não está aqui é recusado. */
const TRANSICOES: Record<EstadoConversa, Partial<Record<AcaoConversa, EstadoConversa>>> = {
  IA: {
    MENSAGEM_DO_CLIENTE: 'IA',
    IA_RESPONDEU: 'AGUARDANDO_CLIENTE',
    IA_PEDIU_HUMANO: 'AGUARDANDO_HUMANO',
    HUMANO_ASSUMIU: 'HUMANO',
    TRANSFERIR_DEPARTAMENTO: 'AGUARDANDO_HUMANO',
    ENCERRAR: 'ENCERRADA',
  },
  AGUARDANDO_CLIENTE: {
    // Cliente respondeu: a conversa volta para quem estava com ela. Se
    // estava com a IA, volta para IA — este estado só existe depois de a
    // IA ter falado.
    MENSAGEM_DO_CLIENTE: 'IA',
    IA_RESPONDEU: 'AGUARDANDO_CLIENTE',
    IA_PEDIU_HUMANO: 'AGUARDANDO_HUMANO',
    HUMANO_ASSUMIU: 'HUMANO',
    TRANSFERIR_DEPARTAMENTO: 'AGUARDANDO_HUMANO',
    ENCERRAR: 'ENCERRADA',
  },
  AGUARDANDO_HUMANO: {
    MENSAGEM_DO_CLIENTE: 'AGUARDANDO_HUMANO',
    // A IA continua respondendo na fila — só some quando um humano
    // assume de verdade (HUMANO_ASSUMIU). Fica em AGUARDANDO_HUMANO,
    // não em AGUARDANDO_CLIENTE, pra não sumir da fila de espera.
    IA_RESPONDEU: 'AGUARDANDO_HUMANO',
    HUMANO_ASSUMIU: 'HUMANO',
    TRANSFERIR_DEPARTAMENTO: 'AGUARDANDO_HUMANO',
    DEVOLVER_PARA_IA: 'IA',
    ENCERRAR: 'ENCERRADA',
  },
  HUMANO: {
    // O cliente responder NÃO devolve a conversa para a IA.
    MENSAGEM_DO_CLIENTE: 'HUMANO',
    HUMANO_RESPONDEU: 'HUMANO',
    HUMANO_ASSUMIU: 'HUMANO',
    TRANSFERIR_DEPARTAMENTO: 'AGUARDANDO_HUMANO',
    DEVOLVER_PARA_IA: 'IA',
    ENCERRAR: 'ENCERRADA',
  },
  ENCERRADA: {
    REABRIR_PARA_HUMANO: 'HUMANO',
    REABRIR_PARA_IA: 'IA',
    // Cliente que volta a escrever depois do encerramento não reabre a
    // conversa antiga: abre uma nova. Assim o histórico de atendimento
    // continua legível e os indicadores não misturam dois atendimentos.
  },
};

export function proximoEstado(
  atual: EstadoConversa,
  acao: AcaoConversa,
): EstadoConversa | null {
  return TRANSICOES[atual][acao] ?? null;
}

export function transicaoPermitida(atual: EstadoConversa, acao: AcaoConversa): boolean {
  return proximoEstado(atual, acao) !== null;
}

/**
 * A IA pode responder esta conversa?
 *
 * Em IA (fluxo normal) e também em AGUARDANDO_HUMANO — a IA pediu um
 * humano, mas ninguém assumiu ainda, e o cliente não pode ficar em
 * silêncio até alguém notar a fila. Só pára de responder quando um
 * humano assume de verdade (estado vira HUMANO). AGUARDANDO_CLIENTE vira
 * IA quando o cliente escreve — a transição acontece antes, no
 * processamento da mensagem recebida.
 */
export function iaPodeResponder(estado: EstadoConversa): boolean {
  return estado === 'IA' || estado === 'AGUARDANDO_HUMANO';
}

/** A conversa está com uma pessoa (assumida ou na fila para alguém)? */
export function estaComHumano(estado: EstadoConversa): boolean {
  return estado === 'HUMANO' || estado === 'AGUARDANDO_HUMANO';
}

export function estaAberta(estado: EstadoConversa): boolean {
  return estado !== 'ENCERRADA';
}

/**
 * Estado da conversa depois de o cliente mandar uma mensagem.
 * Encerrada não é reaberta aqui — o chamador abre uma conversa nova.
 */
export function estadoAoReceberMensagem(atual: EstadoConversa): EstadoConversa {
  return proximoEstado(atual, 'MENSAGEM_DO_CLIENTE') ?? atual;
}

/** Ações que a interface oferece ao operador para o estado atual. */
export function acoesDisponiveis(estado: EstadoConversa): AcaoConversa[] {
  return Object.keys(TRANSICOES[estado]) as AcaoConversa[];
}
