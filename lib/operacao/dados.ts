import 'server-only';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirSessao } from '@/lib/sessao';
import { log } from '@/lib/log';
import { contagemDoFiltro, lerContagens, type CaixaAtendimento, type EscopoAtendimento } from './atendimento';
import type { CaixaOperacional, FilaOperacional } from './tipos';
export type Filtros = { caixa?: CaixaOperacional; busca?: string; equipe?: string; responsavel?: string; canal?: string; pagina?: number; ordem?: string };

export type FiltrosAtendimento = {
  escopo: EscopoAtendimento;
  caixa: CaixaAtendimento;
  busca?: string;
  equipe?: string;
  canal?: string;
  pagina?: number;
  ordem?: string;
};

const ESTADOS_HUMANOS = ['HUMANO', 'AGUARDANDO_HUMANO'] as const;
const ESTADOS_IA = ['IA', 'AGUARDANDO_CLIENTE'] as const;

/** Tira do termo de busca os caracteres que quebrariam o filtro `or(...)` do PostgREST. */
function limparBusca(busca?: string) {
  return busca?.trim().replace(/[,%()"\\]/g, '') || '';
}

/**
 * Lista da tela de Atendimento: um escopo (meu, equipe ou IA) e um filtro
 * dentro dele (ver `lib/operacao/atendimento.ts`).
 *
 * Duas consultas, em paralelo: a página de conversas e as contagens de
 * todos os escopos (abas e filtros). O total da lista sai da contagem
 * quando o filtro tem uma — sem rodar a fila uma terceira vez só para
 * contar. Só os filtros antigos e as concluídas, que a contagem não cobre,
 * pedem `count: 'exact'`.
 *
 * Se a função de contagens ainda não existir no banco (migração 0027 não
 * aplicada), a lista funciona mesmo assim, sem números nas abas: melhor
 * uma tela sem contadores do que uma tela quebrada por causa deles.
 */
export async function carregarAtendimento(filtros: FiltrosAtendimento, tamanho = 40) {
  const sessao = await exigirSessao();
  const db = await clienteServidor();
  const pagina = Math.max(1, filtros.pagina || 1);
  const termo = limparBusca(filtros.busca);
  const encerradas = filtros.caixa === 'encerradas';
  const contadoPelaFuncao = ['novos', 'nao-respondidos', 'todos', 'falhas-ia'].includes(filtros.caixa);

  let q = db
    .from('fila_operacional')
    .select('*', contadoPelaFuncao ? {} : { count: 'exact' })
    .eq('organizacao_id', sessao.organizacao.id);

  q = encerradas ? q.eq('estado', 'ENCERRADA') : q.neq('estado', 'ENCERRADA');

  if (filtros.escopo === 'meu') {
    q = q.eq('responsavel_id', sessao.membro.id);
    if (!encerradas) q = q.in('estado', [...ESTADOS_HUMANOS]);
  } else if (!encerradas) {
    q = q.in('estado', filtros.escopo === 'ia' ? [...ESTADOS_IA] : [...ESTADOS_HUMANOS]);
  }

  if (filtros.equipe) q = q.eq('departamento_id', filtros.equipe);
  if (filtros.canal) q = q.eq('canal_id', filtros.canal);

  if (termo) {
    const digitos = termo.replace(/\D/g, '');
    q =
      digitos.length >= 3
        ? q.or(`contato_nome.ilike.%${termo}%,contato_telefone.ilike.%${digitos}%`)
        : q.ilike('contato_nome', `%${termo}%`);
  }

  switch (filtros.caixa) {
    // `nao_lidas` zera quando alguém abre a conversa; é a marca de "visualizada".
    case 'novos': q = q.gt('nao_lidas', 0); break;
    case 'nao-respondidos': q = q.eq('para_responder', true).eq('nao_lidas', 0); break;
    case 'falhas-ia': q = q.eq('falha_ia', true); break;
    // Filtros da fila antiga, alcançados por link da Supervisão.
    case 'responder': q = q.eq('para_responder', true); break;
    case 'retornos': q = q.not('retorno_id', 'is', null); break;
    case 'aguardando': q = q.eq('aguardando_cliente', true); break;
    case 'vencidos': q = q.eq('retorno_vencido', true); break;
    case 'apoio': q = q.eq('estado', 'AGUARDANDO_HUMANO'); break;
    case 'falhas': q = q.or('falhas_envio.gt.0,envio_incerto.eq.true'); break;
    case 'sem-responsavel': q = q.eq('sem_responsavel', true); break;
  }

  // Urgência só faz sentido para quem espera por uma pessoa; o que a IA
  // atende vai por atividade recente.
  if (filtros.escopo !== 'ia' && filtros.ordem !== 'recentes') {
    q = q.order('prioridade_operacional').order('espera_desde', { ascending: true, nullsFirst: false });
  }

  const [lista, contagem] = await Promise.all([
    q
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      .order('id')
      .range((pagina - 1) * tamanho, pagina * tamanho - 1),
    db.rpc('atendimento_contagens', {
      p_membro: sessao.membro.id,
      p_busca: termo,
      p_equipe: filtros.equipe || null,
      p_canal: filtros.canal || null,
    }),
  ]);

  if (lista.error) throw new Error('Não foi possível carregar a fila. Verifique a conexão e a atualização do banco.');

  if (contagem.error) {
    log.warn('Contagens do atendimento indisponíveis; a lista segue sem os números', { erro: contagem.error.message });
  }

  const contagens = contagem.error ? null : lerContagens(contagem.data);
  const total = contagemDoFiltro(contagens, filtros.escopo, filtros.caixa) ?? lista.count ?? null;

  return { itens: lista.data as FilaOperacional[], total, contagens, pagina, tamanho };
}
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
