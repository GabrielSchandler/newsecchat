/**
 * Tipos e constantes da central compartilhados entre servidor e cliente.
 *
 * Ficam separados de `dados.ts` porque aquele arquivo é `server-only` (usa
 * a sessão e o cliente Supabase do servidor). A lista de conversas é um
 * componente de cliente e precisa dos rótulos das caixas — importá-los de
 * lá arrastaria o código de servidor para o navegador, e o build recusa,
 * com razão.
 */
import type {
  Canal,
  Contato,
  Conversa,
  Departamento,
  EstadoConversaBanco,
  Etiqueta,
  MembroOrganizacao,
  Mensagem,
  MemoriaContato,
  NotaInterna,
} from '@/lib/tipos-banco';

export const CAIXAS = [
  'minhas',
  'nao-atribuidas',
  'ia',
  'aguardando-humano',
  'aguardando-cliente',
  'humano',
  'encerradas',
  'todas',
] as const;

export type Caixa = (typeof CAIXAS)[number];

export const rotuloCaixa: Record<Caixa, string> = {
  minhas: 'Minha caixa',
  'nao-atribuidas': 'Não atribuídos',
  ia: 'IA atendendo',
  'aguardando-humano': 'Aguardando humano',
  'aguardando-cliente': 'Aguardando cliente',
  humano: 'Em atendimento',
  encerradas: 'Encerrados',
  todas: 'Todas as abertas',
};

export function caixaValida(valor: string | undefined): Caixa {
  return CAIXAS.includes((valor ?? '') as Caixa) ? (valor as Caixa) : 'todas';
}

/** Estados que cada caixa filtra. `null` = todas as abertas. */
export function estadosDaCaixa(caixa: Caixa): EstadoConversaBanco[] | null {
  switch (caixa) {
    case 'ia':
      return ['IA'];
    case 'aguardando-humano':
      return ['AGUARDANDO_HUMANO'];
    case 'aguardando-cliente':
      return ['AGUARDANDO_CLIENTE'];
    case 'humano':
      return ['HUMANO'];
    case 'encerradas':
      return ['ENCERRADA'];
    default:
      return null;
  }
}

export interface ConversaDaLista {
  conversa: Conversa;
  contato: Pick<Contato, 'id' | 'nome' | 'telefone' | 'nome_perfil_whatsapp'> | null;
  canal: Pick<Canal, 'id' | 'nome'> | null;
  departamento: Pick<Departamento, 'id' | 'nome' | 'cor'> | null;
  responsavelNome: string | null;
}

export interface FiltrosLista {
  caixa: Caixa;
  departamentoId?: string;
  busca?: string;
}

export interface DetalheConversa {
  conversa: Conversa;
  contato: Contato;
  canal: Pick<Canal, 'id' | 'nome' | 'status' | 'ativo' | 'ia_ativa'> | null;
  departamento: Departamento | null;
  responsavelNome: string | null;
  mensagens: Mensagem[];
  notas: (NotaInterna & { autorNome: string | null })[];
  memorias: MemoriaContato[];
  campos: { chave: string; rotulo: string; valor: string | null }[];
  etiquetasDoContato: string[];
  etiquetasDaConversa: string[];
  campanhaNome: string | null;
}

export interface ApoioAtendimento {
  departamentos: Departamento[];
  etiquetas: Etiqueta[];
  atendentes: { membroId: string; nome: string; papel: MembroOrganizacao['papel'] }[];
}

export interface ContagensCaixas {
  minhas: number;
  nao_atribuidas: number;
  ia: number;
  aguardando_humano: number;
  aguardando_cliente: number;
  humano: number;
  encerradas: number;
  todas: number;
}

export const CONTAGENS_VAZIAS: ContagensCaixas = {
  minhas: 0,
  nao_atribuidas: 0,
  ia: 0,
  aguardando_humano: 0,
  aguardando_cliente: 0,
  humano: 0,
  encerradas: 0,
  todas: 0,
};
