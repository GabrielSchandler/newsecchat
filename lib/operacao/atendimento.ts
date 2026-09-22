/**
 * Vocabulário da tela de Atendimento: onde a conversa está e o que falta
 * fazer com ela.
 *
 * Fica fora de `dados.ts` (que é `server-only`) porque a lista é um
 * componente de cliente e precisa dos rótulos. Nada aqui consulta banco.
 *
 * Duas perguntas independentes, e a tela responde as duas de forma
 * explícita:
 *
 *   1. ESCOPO — com quem a conversa está?
 *        meu     uma pessoa é responsável e é você
 *        equipe  uma pessoa é responsável (ou deveria ser: fila humana)
 *        ia      o assistente de IA está atendendo, sem responsável
 *
 *   2. FILTRO — o que falta fazer, dentro do escopo?
 *        novos            o cliente escreveu e ninguém abriu ainda
 *        nao-respondidos  já foi aberta, mas o cliente segue esperando
 *        todos            tudo do escopo
 *
 * "Novos" e "Não respondidos" não se sobrepõem: uma conversa sai de Novos
 * no instante em que alguém a abre e, se não for respondida, passa a Não
 * respondidos.
 */
import { papelAtende } from '@/lib/papeis';
import type { PapelMembro } from '@/lib/tipos-banco';

export type EscopoAtendimento = 'meu' | 'equipe' | 'ia';

export interface OpcaoEscopo {
  id: EscopoAtendimento;
  rotulo: string;
  /** Frase que a tela mostra sob as abas, dizendo o que o usuário está vendo. */
  ajuda: string;
  papelMinimo: PapelMembro;
}

const OPCOES: Record<EscopoAtendimento, OpcaoEscopo> = {
  meu: {
    id: 'meu',
    rotulo: 'Meu atendimento',
    ajuda: 'Conversas atribuídas a você, em atendimento humano.',
    papelMinimo: 'ATENDENTE',
  },
  equipe: {
    id: 'equipe',
    rotulo: 'Equipe',
    ajuda: 'Todo o atendimento humano, de todos os consultores e também o que ainda está sem responsável.',
    papelMinimo: 'ATENDENTE',
  },
  ia: {
    id: 'ia',
    rotulo: 'IA',
    ajuda: 'Conversas que o assistente de IA está atendendo agora. Ninguém da equipe é responsável por elas.',
    papelMinimo: 'SUPERVISOR',
  },
};

/** Na ordem em que as abas aparecem. */
export const ESCOPOS: OpcaoEscopo[] = [OPCOES.meu, OPCOES.equipe, OPCOES.ia];

export function opcaoDoEscopo(escopo: EscopoAtendimento): OpcaoEscopo {
  return OPCOES[escopo];
}

/** A aba de IA só existe para quem supervisiona; o banco continua mandando na visibilidade. */
export function escoposDoPapel(papel: PapelMembro): OpcaoEscopo[] {
  return ESCOPOS.filter((escopo) => papelAtende(papel, escopo.papelMinimo));
}

export type FiltroAtendimento = 'novos' | 'nao-respondidos' | 'todos' | 'falhas-ia';

export interface OpcaoFiltro {
  id: FiltroAtendimento;
  rotulo: string;
  ajuda: string;
}

export const FILTROS_HUMANOS: OpcaoFiltro[] = [
  { id: 'novos', rotulo: 'Novos', ajuda: 'O cliente escreveu e ninguém abriu a conversa ainda.' },
  {
    id: 'nao-respondidos',
    rotulo: 'Não respondidos',
    ajuda: 'A conversa já foi aberta, mas o cliente continua esperando uma resposta.',
  },
  { id: 'todos', rotulo: 'Todos', ajuda: 'Todas as conversas deste escopo.' },
];

export const FILTROS_IA: OpcaoFiltro[] = [
  { id: 'todos', rotulo: 'Todas', ajuda: 'Todas as conversas que a IA está atendendo.' },
  { id: 'falhas-ia', rotulo: 'Com falha', ajuda: 'A IA tentou responder e não conseguiu.' },
];

export function filtrosDoEscopo(escopo: EscopoAtendimento): OpcaoFiltro[] {
  return escopo === 'ia' ? FILTROS_IA : FILTROS_HUMANOS;
}

/**
 * Filtros da fila antiga. Continuam valendo porque a Supervisão e as
 * Equipes ainda apontam para eles ("3 clientes aguardando" abre a lista
 * desses 3), mas não têm botão na tela de Atendimento: aparecem só como
 * um filtro extra, removível, quando alguém chega por um desses links.
 */
export const FILTROS_ANTIGOS = {
  responder: 'Clientes aguardando',
  retornos: 'Com retorno agendado',
  aguardando: 'Aguardando o cliente',
  'sem-responsavel': 'Sem responsável',
  vencidos: 'Retornos vencidos',
  apoio: 'IA pediu um humano',
  falhas: 'Falhas de envio',
  encerradas: 'Concluídas',
} as const;

export type FiltroAntigo = keyof typeof FILTROS_ANTIGOS;
export type CaixaAtendimento = FiltroAtendimento | FiltroAntigo;

export function ehFiltroAntigo(valor: string): valor is FiltroAntigo {
  return Object.prototype.hasOwnProperty.call(FILTROS_ANTIGOS, valor);
}

/**
 * Escopo pedido na URL, já limitado ao que o papel pode ver.
 *
 * `escopo` ausente ou desconhecido é "meu", como sempre foi. Links antigos
 * da Supervisão chegam com `caixa=ia`, que naquela época significava "o
 * que a IA atende" — hoje isso é o escopo IA.
 */
export function resolverEscopo(
  escopo: string | undefined,
  caixa: string | undefined,
  papel: PapelMembro,
): EscopoAtendimento {
  const pedido: EscopoAtendimento =
    caixa === 'ia' || caixa === 'falhas-ia' ? 'ia' : escopo === 'equipe' || escopo === 'ia' ? escopo : 'meu';

  return escoposDoPapel(papel).some((opcao) => opcao.id === pedido) ? pedido : 'meu';
}

/**
 * Filtro pedido na URL, coerente com o escopo. O que não existe naquele
 * escopo (ex.: "Novos" dentro da IA, onde ninguém "abre" a conversa) cai em
 * "todos" em vez de mostrar uma lista vazia sem explicação.
 */
export function resolverFiltro(caixa: string | undefined, escopo: EscopoAtendimento): CaixaAtendimento {
  if (!caixa) return 'todos';
  if (ehFiltroAntigo(caixa)) return caixa;
  return filtrosDoEscopo(escopo).some((opcao) => opcao.id === caixa) ? (caixa as FiltroAtendimento) : 'todos';
}

/** Contagens devolvidas por `atendimento_contagens`, por escopo. */
export interface ContagensAtendimento {
  meu: { novos: number; nao_respondidos: number; todos: number };
  equipe: { novos: number; nao_respondidos: number; todos: number };
  ia: { todos: number; falhas: number };
}

/**
 * Qual número da contagem corresponde a cada filtro. `null` quando o
 * filtro não tem contagem própria (filtros antigos, concluídas): nesses
 * casos o total da lista vem da própria consulta.
 */
export function contagemDoFiltro(
  contagens: ContagensAtendimento | null,
  escopo: EscopoAtendimento,
  filtro: CaixaAtendimento,
): number | null {
  if (!contagens) return null;

  if (escopo === 'ia') {
    if (filtro === 'todos') return contagens.ia.todos;
    if (filtro === 'falhas-ia') return contagens.ia.falhas;
    return null;
  }

  const grupo = contagens[escopo];
  if (filtro === 'novos') return grupo.novos;
  if (filtro === 'nao-respondidos') return grupo.nao_respondidos;
  if (filtro === 'todos') return grupo.todos;
  return null;
}

/** Aceita o JSON cru do banco; devolve `null` se não tiver a forma esperada. */
export function lerContagens(bruto: unknown): ContagensAtendimento | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;

  const objeto = bruto as Record<string, unknown>;
  const numero = (grupo: unknown, chave: string): number => {
    if (!grupo || typeof grupo !== 'object') return 0;
    const valor = (grupo as Record<string, unknown>)[chave];
    return typeof valor === 'number' ? valor : 0;
  };

  return {
    meu: {
      novos: numero(objeto.meu, 'novos'),
      nao_respondidos: numero(objeto.meu, 'nao_respondidos'),
      todos: numero(objeto.meu, 'todos'),
    },
    equipe: {
      novos: numero(objeto.equipe, 'novos'),
      nao_respondidos: numero(objeto.equipe, 'nao_respondidos'),
      todos: numero(objeto.equipe, 'todos'),
    },
    ia: { todos: numero(objeto.ia, 'todos'), falhas: numero(objeto.ia, 'falhas') },
  };
}
