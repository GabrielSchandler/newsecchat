import type { Conversa, Json } from '@/lib/tipos-banco';

export type RegraAtendimento = {
  id: string; organizacao_id: string; versao: number; fuso: string;
  dias: number[]; intervalos: { inicio: string; fim: string }[]; feriados: string[];
  meta_minutos: number; alerta_minutos: number; retorno_dias: number;
  reabrir: boolean; criado_em: string; criado_por: string | null;
};
export type Retorno = {
  id: string; organizacao_id: string; conversa_id: string; responsavel_id: string;
  motivo: string; prazo: string; estado: 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO';
  criado_por: string; criado_em: string; atualizado_em: string; versao: number;
};
export type RespostaRapida = {
  id: string; organizacao_id: string; autor_id: string; departamento_id: string | null;
  compartilhada: boolean; nome: string; atalho: string; categoria: string;
  conteudo: string; criado_em: string; atualizado_em: string;
};
export type FilaOperacional = Conversa & {
  alerta_resposta:boolean; falha_ia:boolean|null; ultimo_autor_membro:string|null; envio_incerto:boolean;
  contato_nome: string; contato_telefone: string; contato_email: string | null; contato_foto: string | null;
  canal_nome: string; canal_status: string; equipe_nome: string | null;
  responsavel_nome: string | null; ultimo_autor: string | null;
  ultimo_publico_em: string | null; ultimo_texto: string | null;
  espera_desde: string | null; prazo_resposta: string | null;
  retorno_id: string | null; retorno_prazo: string | null; retorno_motivo: string | null;
  para_responder: boolean; aguardando_cliente: boolean; sem_responsavel: boolean;
  com_ia: boolean; novo: boolean; retorno_vencido: boolean; resposta_vencida: boolean;
  sugestao_retorno: boolean; prioridade_operacional: number; falhas_envio: number;
  etiquetas: Json; ultima_mensagem_cliente: string | null; ultimo_envio_humano: string | null;
};
export type CaixaOperacional = 'prioridades' | 'novos' | 'responder' | 'retornos' | 'aguardando' | 'todos' | 'ia' | 'sem-responsavel' | 'encerradas' | 'apoio' | 'falhas' | 'falhas-ia' | 'vencidos';
export const CAIXAS_OPERACIONAIS: { id: CaixaOperacional; rotulo: string }[] = [
  { id: 'prioridades', rotulo: 'Prioridades' }, { id: 'novos', rotulo: 'Novos' },
  { id: 'responder', rotulo: 'Responder' }, { id: 'retornos', rotulo: 'Retornos' },
  { id: 'aguardando', rotulo: 'Aguardando' }, { id: 'todos', rotulo: 'Todos' },
];
export function situacao(item: FilaOperacional) {
  if (item.estado === 'ENCERRADA') return { texto: 'Concluída', tom: 'neutro' as const };
  if (item.resposta_vencida) return { texto: 'Prazo vencido', tom: 'erro' as const };
  if (item.alerta_resposta) return { texto: 'Prazo próximo', tom: 'alerta' as const };
  if (item.estado === 'AGUARDANDO_HUMANO') return { texto: 'Pedido de humano', tom: 'ia' as const };
  if (item.retorno_vencido) return { texto: 'Retorno vencido', tom: 'erro' as const };
  if (item.para_responder) return { texto: 'Responder', tom: 'alerta' as const };
  if (item.sem_responsavel) return { texto: 'Atribuir', tom: 'produto' as const };
  if (item.com_ia) return { texto: 'Com IA', tom: 'ia' as const };
  if (item.retorno_prazo) return { texto: 'Retorno agendado', tom: 'produto' as const };
  if (item.sugestao_retorno) return { texto: 'Sugerir retorno', tom: 'neutro' as const };
  return { texto: 'Aguardando cliente', tom: 'neutro' as const };
}
export function interpolarResposta(texto: string, contato: { nome?: string | null; telefone?: string | null }) {
  const variaveis: Record<string, string> = {
    primeiro_nome: contato.nome?.trim().split(/\s+/)[0] ?? '', nome: contato.nome ?? '', telefone: contato.telefone ?? '',
  };
  const ausentes = new Set<string>();
  const resultado = texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, chave: string) => {
    if (!variaveis[chave]) ausentes.add(chave);
    return variaveis[chave] || `{{${chave}}}`;
  });
  return { texto: resultado, ausentes: [...ausentes] };
}
