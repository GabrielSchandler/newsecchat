import { HIERARQUIA_PAPEL } from '@/lib/papeis';
import type { PapelMembro } from '@/lib/tipos-banco';

/**
 * Menu da barra lateral.
 *
 * `papelMinimo` esconde o item de quem não pode usar. Esconder é conforto
 * de interface, não segurança: cada página e cada ação confere o papel de
 * novo no servidor. Quem digitar a URL na mão bate na verificação de lá.
 */
export interface ItemMenu {
  rotulo: string;
  caminho: string;
  icone: NomeIcone;
  papelMinimo: PapelMembro;
  /** Item pai destacado quando a rota atual começa por este caminho. */
  prefixo?: boolean;
}

export type NomeIcone =
  | 'conversas'
  | 'painel'
  | 'contatos'
  | 'campanhas'
  | 'ia'
  | 'integracoes'
  | 'configuracoes';

export const MENU: ItemMenu[] = [
  {
    rotulo: 'Atendimento',
    caminho: '/atendimento',
    icone: 'conversas',
    papelMinimo: 'ATENDENTE',
    prefixo: true,
  },
  { rotulo: 'Painel', caminho: '/painel', icone: 'painel', papelMinimo: 'ATENDENTE' },
  { rotulo: 'Contatos', caminho: '/contatos', icone: 'contatos', papelMinimo: 'ATENDENTE', prefixo: true },
  {
    rotulo: 'Campanhas',
    caminho: '/campanhas',
    icone: 'campanhas',
    papelMinimo: 'SUPERVISOR',
    prefixo: true,
  },
  { rotulo: 'IA', caminho: '/ia', icone: 'ia', papelMinimo: 'SUPERVISOR', prefixo: true },
  {
    rotulo: 'Integrações',
    caminho: '/integracoes',
    icone: 'integracoes',
    papelMinimo: 'ADMIN',
    prefixo: true,
  },
  {
    rotulo: 'Configurações',
    caminho: '/configuracoes',
    icone: 'configuracoes',
    papelMinimo: 'ADMIN',
    prefixo: true,
  },
];

export function menuVisivel(papel: PapelMembro): ItemMenu[] {
  return MENU.filter((item) => HIERARQUIA_PAPEL[papel] >= HIERARQUIA_PAPEL[item.papelMinimo]);
}

/** Submenu de Configurações. */
export const MENU_CONFIGURACOES = [
  { rotulo: 'Organização', caminho: '/configuracoes' },
  { rotulo: 'Canais de WhatsApp', caminho: '/configuracoes/canais' },
  { rotulo: 'Usuários', caminho: '/configuracoes/usuarios' },
  { rotulo: 'Departamentos', caminho: '/configuracoes/departamentos' },
  { rotulo: 'Campos do contato', caminho: '/configuracoes/campos' },
  { rotulo: 'Auditoria', caminho: '/configuracoes/auditoria' },
] as const;

/** Submenu de IA. */
export const MENU_IA = [
  { rotulo: 'Configuração', caminho: '/ia' },
  { rotulo: 'Versões', caminho: '/ia/versoes' },
  { rotulo: 'Análise de atendimentos', caminho: '/ia/analise' },
] as const;
