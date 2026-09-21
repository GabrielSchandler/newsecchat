import 'server-only';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirSessao } from '@/lib/sessao';
import type { CaixaOperacional, FilaOperacional } from './tipos';
export type Filtros = { caixa?: CaixaOperacional; busca?: string; equipe?: string; responsavel?: string; canal?: string; pagina?: number; ordem?: string };
export async function carregarFila(filtros: Filtros = {}, tamanho = 40) {
  const sessao = await exigirSessao(); const db = await clienteServidor();
  const pagina = Math.max(1, filtros.pagina || 1);
  let q = db.from('fila_operacional').select('*', { count: 'exact' }).eq('organizacao_id', sessao.organizacao.id);
  q = filtros.caixa === 'encerradas' ? q.eq('estado', 'ENCERRADA') : q.neq('estado', 'ENCERRADA');
  if (filtros.equipe) q = q.eq('departamento_id', filtros.equipe);
  if (filtros.responsavel) q = q.eq('responsavel_id', filtros.responsavel);
  if (filtros.canal) q = q.eq('canal_id', filtros.canal);
  const termo = filtros.busca?.trim().replace(/[,%()"\\]/g, '') || '';
  if (termo) {
    const digitos = termo.replace(/\D/g, '');
    q = digitos.length >= 3 ? q.or(`contato_nome.ilike.%${termo}%,contato_telefone.ilike.%${digitos}%`) : q.ilike('contato_nome', `%${termo}%`);
  }
  switch (filtros.caixa) {
    case 'prioridades': q = q.lt('prioridade_operacional', 5); break;
    case 'novos': q = q.eq('novo', true); break;
    case 'responder': q = q.eq('para_responder', true); break;
    case 'retornos': q = q.not('retorno_id', 'is', null); break;
    case 'aguardando': q = q.eq('aguardando_cliente', true); break;
    case 'vencidos': q=q.eq('retorno_vencido',true); break;
    case 'apoio': q=q.eq('estado','AGUARDANDO_HUMANO'); break;
    case 'falhas': q=q.or('falhas_envio.gt.0,envio_incerto.eq.true'); break;
    case 'falhas-ia': q=q.eq('falha_ia',true); break;
    case 'ia': q = q.eq('com_ia', true); break;
    case 'sem-responsavel': q = q.eq('sem_responsavel', true); break;
  }
  if (filtros.ordem !== 'recentes') q = q.order('prioridade_operacional').order('espera_desde', { ascending: true, nullsFirst: false });
  const [lista, contagem] = await Promise.all([
    q.order('ultima_mensagem_em', { ascending: false, nullsFirst: false }).order('id').range((pagina - 1) * tamanho, pagina * tamanho - 1),
    db.rpc('fila_contagens', { p_busca: termo, p_equipe: filtros.equipe || null, p_responsavel: filtros.responsavel || null, p_canal: filtros.canal || null }),
  ]);
  if (lista.error || contagem.error) throw new Error('Não foi possível carregar a fila. Verifique a conexão e a atualização do banco.');
  return { itens: lista.data as FilaOperacional[], total: lista.count || 0, contagens: contagem.data as Record<string, number>, pagina };
}
export async function carregarRegra() {
  const sessao = await exigirSessao(); const db = await clienteServidor();
  const { data, error } = await db.from('regras_atendimento').select('*').eq('organizacao_id', sessao.organizacao.id).order('versao', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Não foi possível carregar as regras de atendimento.');
  return data;
}
export async function carregarRespostas() {
  const sessao = await exigirSessao(); const db = await clienteServidor();
  const { data, error } = await db.from('respostas_rapidas').select('*').eq('organizacao_id', sessao.organizacao.id).order('categoria').order('nome');
  if (error) throw new Error('Não foi possível carregar as respostas rápidas.');
  return data || [];
}
export function lerFiltros(parametros: Record<string, string | string[] | undefined>): Filtros {
  const ler = (nome: string) => { const v = parametros[nome]; return Array.isArray(v) ? v[0] : v; };
  return { caixa: (ler('caixa') || 'prioridades') as CaixaOperacional, busca: ler('busca'), equipe: ler('equipe'), responsavel: ler('responsavel'), canal: ler('canal'), pagina: Number(ler('pagina')) || 1, ordem: ler('ordem') };
}
