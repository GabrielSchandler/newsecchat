import { HIERARQUIA_PAPEL } from '@/lib/papeis';
import type { PapelMembro } from '@/lib/tipos-banco';
export type NomeIcone = 'conversas' | 'painel' | 'contatos' | 'campanhas' | 'ia' | 'integracoes' | 'configuracoes' | 'retornos' | 'respostas' | 'equipes' | 'relatorios';
export interface ItemMenu { rotulo: string; caminho: string; icone: NomeIcone; papelMinimo: PapelMembro; prefixo?: boolean; secundario?: boolean }
export const MENU: ItemMenu[] = [
  { rotulo: 'Atendimento', caminho: '/atendimento', icone: 'conversas', papelMinimo: 'ATENDENTE', prefixo: true },
  { rotulo: 'Contatos', caminho: '/contatos', icone: 'contatos', papelMinimo: 'ATENDENTE', prefixo: true },
  { rotulo: 'Retornos', caminho: '/retornos', icone: 'retornos', papelMinimo: 'ATENDENTE' },
  { rotulo: 'Respostas rápidas', caminho: '/respostas-rapidas', icone: 'respostas', papelMinimo: 'ATENDENTE' },
  { rotulo: 'Supervisão', caminho: '/supervisao', icone: 'painel', papelMinimo: 'SUPERVISOR' },
  { rotulo: 'Equipes', caminho: '/equipes', icone: 'equipes', papelMinimo: 'SUPERVISOR' },
  { rotulo: 'Assistente IA', caminho: '/assistente-ia', icone: 'ia', papelMinimo: 'SUPERVISOR' },
  { rotulo: 'Relatórios', caminho: '/relatorios', icone: 'relatorios', papelMinimo: 'SUPERVISOR' },
  { rotulo: 'Campanhas', caminho: '/campanhas', icone: 'campanhas', papelMinimo: 'SUPERVISOR', prefixo: true, secundario: true },
  { rotulo: 'Integrações', caminho: '/integracoes', icone: 'integracoes', papelMinimo: 'ADMIN', prefixo: true, secundario: true },
  { rotulo: 'Configurações', caminho: '/configuracoes', icone: 'configuracoes', papelMinimo: 'ADMIN', prefixo: true },
];
export const menuVisivel = (papel: PapelMembro) => MENU.filter(item => HIERARQUIA_PAPEL[papel] >= HIERARQUIA_PAPEL[item.papelMinimo]);
export const MENU_CONFIGURACOES = [
  { rotulo: 'Canais', caminho: '/configuracoes/canais' }, { rotulo: 'Regras de atendimento', caminho: '/configuracoes/atendimento' },
  { rotulo: 'Usuários e permissões', caminho: '/configuracoes/usuarios' }, { rotulo: 'Etiquetas', caminho: '/configuracoes/etiquetas' },
  { rotulo: 'Organização', caminho: '/configuracoes' }, { rotulo: 'Equipes', caminho: '/configuracoes/departamentos' },
  { rotulo: 'Campos do contato', caminho: '/configuracoes/campos' }, { rotulo: 'Auditoria', caminho: '/configuracoes/auditoria' },
] as const;
export const MENU_IA = [{ rotulo: 'Monitoramento', caminho: '/assistente-ia' }, { rotulo: 'Configuração', caminho: '/ia' }, { rotulo: 'Versões', caminho: '/ia/versoes' }, { rotulo: 'Análise', caminho: '/ia/analise' }] as const;
