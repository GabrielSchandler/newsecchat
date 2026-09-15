'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirPapel } from '@/lib/sessao';
import { enfileirar, FILAS } from '@/lib/filas/produtor';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { integracaoConfigurada } from '@/lib/ambiente';
import { log } from '@/lib/log';
import type { Json, VersaoAgenteIa } from '@/lib/tipos-banco';

export interface Resultado {
  ok: boolean;
  erro?: string;
  aviso?: string;
  versaoId?: string;
}

const uuid = z.string().uuid();

const esquemaConteudo = z.object({
  persona: z.string().max(2000),
  nomeExibicao: z.string().trim().max(60).nullable(),
  tom: z.string().max(1000),
  descricaoEmpresa: z.string().max(4000),
  servicos: z.string().max(4000),
  baseConhecimento: z.string().max(20000),
  objetivos: z.string().max(4000),
  regras: z.string().max(4000),
  limitacoes: z.string().max(4000),
  informacoesProibidas: z.string().max(4000),
  mensagemFallback: z.string().max(500),
  perguntas: z.array(z.string().max(300)).max(30),
  criteriosTransferencia: z.array(z.string().max(300)).max(30),
  horarios: z.record(z.unknown()),
  notas: z.string().max(1000).nullable(),
});

type ConteudoVersao = z.infer<typeof esquemaConteudo>;

function paraColunas(conteudo: ConteudoVersao) {
  return {
    persona: conteudo.persona,
    nome_exibicao: conteudo.nomeExibicao,
    tom: conteudo.tom,
    descricao_empresa: conteudo.descricaoEmpresa,
    servicos: conteudo.servicos,
    base_conhecimento: conteudo.baseConhecimento,
    objetivos: conteudo.objetivos,
    regras: conteudo.regras,
    limitacoes: conteudo.limitacoes,
    informacoes_proibidas: conteudo.informacoesProibidas,
    mensagem_fallback: conteudo.mensagemFallback,
    perguntas: conteudo.perguntas as unknown as Json,
    criterios_transferencia: conteudo.criteriosTransferencia as unknown as Json,
    horarios: conteudo.horarios as unknown as Json,
    notas_da_versao: conteudo.notas,
  };
}

/**
 * Salva um rascunho.
 *
 * Editar NUNCA altera a versão publicada. Se a última versão do agente já
 * é um rascunho, ele é atualizado; se a última é a publicada, nasce um
 * rascunho novo a partir dela. É isso que garante que o que está no ar
 * continue exatamente como foi aprovado.
 */
export async function salvarRascunho(entrada: {
  agenteId: string;
  conteudo: ConteudoVersao;
}): Promise<Resultado> {
  const conferido = z
    .object({ agenteId: uuid, conteudo: esquemaConteudo })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data: agente } = await supabase
    .from('agentes_ia')
    .select('id')
    .eq('id', conferido.data.agenteId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!agente) return { ok: false, erro: 'Agente não encontrado' };

  const { data: rascunho } = await supabase
    .from('versoes_agente_ia')
    .select('id')
    .eq('agente_id', conferido.data.agenteId)
    .eq('status', 'RASCUNHO')
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rascunho) {
    const { error } = await supabase
      .from('versoes_agente_ia')
      .update(paraColunas(conferido.data.conteudo))
      .eq('id', rascunho.id)
      .eq('organizacao_id', sessao.organizacao.id);

    if (error) return { ok: false, erro: 'Não foi possível salvar o rascunho.' };

    revalidatePath('/ia');
    return { ok: true, versaoId: rascunho.id };
  }

  const { data: proxima, error: erroNumero } = await supabase.rpc('proxima_versao_agente', {
    p_agente_id: conferido.data.agenteId,
  });

  if (erroNumero) return { ok: false, erro: 'Não foi possível calcular a versão.' };

  const { data: publicada } = await supabase
    .from('versoes_agente_ia')
    .select('id')
    .eq('agente_id', conferido.data.agenteId)
    .eq('status', 'PUBLICADA')
    .maybeSingle();

  const { data: criada, error } = await supabase
    .from('versoes_agente_ia')
    .insert({
      organizacao_id: sessao.organizacao.id,
      agente_id: conferido.data.agenteId,
      versao: proxima ?? 1,
      status: 'RASCUNHO',
      origem: 'HUMANO',
      criado_por: sessao.membro.id,
      substitui_versao_id: publicada?.id ?? null,
      ...paraColunas(conferido.data.conteudo),
    })
    .select('id')
    .single();

  if (error) {
    log.error('Falha ao criar rascunho da IA', { erro: error.message });
    return { ok: false, erro: 'Não foi possível criar o rascunho.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_VERSAO_CRIADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'versoes_agente_ia',
    entidadeId: criada.id,
    metadados: { versao: proxima },
  });

  revalidatePath('/ia');
  revalidatePath('/ia/versoes');
  return { ok: true, versaoId: criada.id };
}

/** Publica uma versão. É o único caminho para mudar o que roda em produção. */
export async function publicarVersao(versaoId: string): Promise<Resultado> {
  if (!uuid.safeParse(versaoId).success) return { ok: false, erro: 'Versão inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data: versao } = await supabase
    .from('versoes_agente_ia')
    .select('id, versao, status, descricao_empresa')
    .eq('id', versaoId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!versao) return { ok: false, erro: 'Versão não encontrada' };
  if (versao.status === 'PUBLICADA') return { ok: false, erro: 'Esta versão já está publicada.' };

  const { data: publicou, error } = await supabase.rpc('publicar_versao_ia', {
    p_versao_id: versaoId,
    p_membro_id: sessao.membro.id,
  });

  if (error || !publicou) {
    return { ok: false, erro: 'Não foi possível publicar a versão.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_VERSAO_PUBLICADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'versoes_agente_ia',
    entidadeId: versaoId,
    metadados: { versao: versao.versao },
  });

  revalidatePath('/ia');
  revalidatePath('/ia/versoes');

  if (!versao.descricao_empresa.trim()) {
    return {
      ok: true,
      aviso:
        'Versão publicada, mas a descrição da empresa está vazia — a IA vai atender sem saber o que a empresa faz.',
    };
  }

  return { ok: true };
}

/** Volta a uma versão anterior criando uma cópia dela como rascunho. */
export async function restaurarVersao(versaoId: string): Promise<Resultado> {
  if (!uuid.safeParse(versaoId).success) return { ok: false, erro: 'Versão inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data: origem } = await supabase
    .from('versoes_agente_ia')
    .select('*')
    .eq('id', versaoId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!origem) return { ok: false, erro: 'Versão não encontrada' };

  // Restaurar cria um rascunho em vez de publicar direto: a volta atrás
  // passa pela mesma revisão que qualquer outra mudança.
  const conteudo: ConteudoVersao = {
    persona: origem.persona,
    nomeExibicao: origem.nome_exibicao,
    tom: origem.tom,
    descricaoEmpresa: origem.descricao_empresa,
    servicos: origem.servicos,
    baseConhecimento: origem.base_conhecimento,
    objetivos: origem.objetivos,
    regras: origem.regras,
    limitacoes: origem.limitacoes,
    informacoesProibidas: origem.informacoes_proibidas,
    mensagemFallback: origem.mensagem_fallback,
    perguntas: Array.isArray(origem.perguntas) ? (origem.perguntas as unknown[]).map(String) : [],
    criteriosTransferencia: Array.isArray(origem.criterios_transferencia)
      ? (origem.criterios_transferencia as unknown[]).map(String)
      : [],
    horarios:
      origem.horarios && typeof origem.horarios === 'object' && !Array.isArray(origem.horarios)
        ? (origem.horarios as Record<string, unknown>)
        : {},
    notas: `Cópia da versão ${origem.versao}.`,
  };

  // Um rascunho pendente seria sobrescrito sem aviso.
  const { data: rascunhoExistente } = await supabase
    .from('versoes_agente_ia')
    .select('versao')
    .eq('agente_id', origem.agente_id)
    .eq('status', 'RASCUNHO')
    .maybeSingle();

  const resultado = await salvarRascunho({ agenteId: origem.agente_id, conteudo });

  if (resultado.ok && rascunhoExistente) {
    return {
      ...resultado,
      aviso: `O rascunho que existia (versão ${rascunhoExistente.versao}) foi substituído pelo conteúdo da versão ${origem.versao}.`,
    };
  }

  return resultado;
}

export async function atualizarAgente(entrada: {
  agenteId: string;
  nome: string;
  modelo: string;
  temperatura: number;
  maxMensagensSeguidas: number;
  ativo: boolean;
}): Promise<Resultado> {
  const conferido = z
    .object({
      agenteId: uuid,
      nome: z.string().trim().min(2).max(80),
      modelo: z.string().trim().min(2).max(60),
      temperatura: z.number().min(0).max(1),
      maxMensagensSeguidas: z.number().int().min(1).max(5),
      ativo: z.boolean(),
    })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('agentes_ia')
    .update({
      nome: conferido.data.nome,
      modelo: conferido.data.modelo,
      temperatura: conferido.data.temperatura,
      max_mensagens_seguidas: conferido.data.maxMensagensSeguidas,
      ativo: conferido.data.ativo,
    })
    .eq('id', conferido.data.agenteId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_AGENTE_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'agentes_ia',
    entidadeId: conferido.data.agenteId,
  });

  revalidatePath('/ia');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Análise de atendimentos
// ---------------------------------------------------------------------

export async function iniciarAnalise(dias: number): Promise<Resultado> {
  const conferido = z.number().int().min(1).max(90).safeParse(dias);
  if (!conferido.success) return { ok: false, erro: 'Período inválido' };

  const sessao = await exigirPapel('ADMIN');

  if (!integracaoConfigurada('IA')) {
    return {
      ok: false,
      erro: 'A análise precisa do provedor de IA configurado. Preencha OPENAI_API_KEY no .env.local.',
    };
  }

  const supabase = await clienteServidor();

  // Uma análise por vez: duas rodando no mesmo período gerariam sugestões
  // duplicadas para quem revisa.
  const { data: emAndamento } = await supabase
    .from('execucoes_analise_ia')
    .select('id')
    .eq('organizacao_id', sessao.organizacao.id)
    .in('status', ['PENDENTE', 'EXECUTANDO'])
    .limit(1)
    .maybeSingle();

  if (emAndamento) {
    return { ok: false, erro: 'Já existe uma análise em andamento. Aguarde ela terminar.' };
  }

  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - conferido.data);

  const { data: agente } = await supabase
    .from('agentes_ia')
    .select('id')
    .eq('organizacao_id', sessao.organizacao.id)
    .eq('padrao', true)
    .maybeSingle();

  const { data: execucao, error } = await supabase
    .from('execucoes_analise_ia')
    .insert({
      organizacao_id: sessao.organizacao.id,
      agente_id: agente?.id ?? null,
      status: 'PENDENTE',
      periodo_inicio: inicio.toISOString(),
      periodo_fim: fim.toISOString(),
      iniciado_por: sessao.membro.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, erro: 'Não foi possível iniciar a análise.' };

  try {
    await enfileirar(
      FILAS.analiseIa,
      { execucaoId: execucao.id, organizacaoId: sessao.organizacao.id },
      { id: `analise:${execucao.id}` },
    );
  } catch (erro) {
    await supabase
      .from('execucoes_analise_ia')
      .update({ status: 'FALHOU', erro: 'Não foi possível enfileirar a análise.' })
      .eq('id', execucao.id);

    return {
      ok: false,
      erro: `A análise não pôde ser enfileirada: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
    };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_ANALISE_INICIADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'execucoes_analise_ia',
    entidadeId: execucao.id,
    metadados: { dias: conferido.data },
  });

  revalidatePath('/ia/analise');
  return { ok: true };
}

/**
 * Aprova uma sugestão.
 *
 * Aprovar NÃO publica: aplica o texto sugerido sobre o rascunho atual e
 * deixa para o humano revisar o conjunto e publicar. É a diferença entre
 * a IA propor e a IA se autoalterar.
 */
export async function aprovarSugestao(sugestaoId: string): Promise<Resultado> {
  if (!uuid.safeParse(sugestaoId).success) return { ok: false, erro: 'Sugestão inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data: sugestao } = await supabase
    .from('sugestoes_ia')
    .select('*')
    .eq('id', sugestaoId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!sugestao) return { ok: false, erro: 'Sugestão não encontrada' };
  if (sugestao.status !== 'PENDENTE') return { ok: false, erro: 'Esta sugestão já foi revisada.' };

  const proposta =
    sugestao.alteracao_proposta &&
    typeof sugestao.alteracao_proposta === 'object' &&
    !Array.isArray(sugestao.alteracao_proposta)
      ? (sugestao.alteracao_proposta as Record<string, unknown>)
      : {};

  const campo = typeof proposta.campo === 'string' ? proposta.campo : null;
  const texto = typeof proposta.texto === 'string' ? proposta.texto : null;

  const CAMPOS_PERMITIDOS = [
    'base_conhecimento',
    'regras',
    'objetivos',
    'limitacoes',
    'persona',
    'tom',
    'informacoes_proibidas',
  ] as const;

  let versaoId: string | null = null;

  if (campo && texto && (CAMPOS_PERMITIDOS as readonly string[]).includes(campo)) {
    const agenteId = sugestao.agente_id;
    if (!agenteId) return { ok: false, erro: 'A sugestão não aponta para um agente.' };

    const { data: base } = await supabase
      .from('versoes_agente_ia')
      .select('*')
      .eq('agente_id', agenteId)
      .in('status', ['RASCUNHO', 'PUBLICADA'])
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!base) return { ok: false, erro: 'Nenhuma versão encontrada para aplicar a sugestão.' };

    // O texto é ACRESCENTADO, não substitui o que já existe: sugestão de
    // IA sobrescrevendo instrução escrita por gente apaga conhecimento.
    const atual = String((base as unknown as Record<string, unknown>)[campo] ?? '');
    const novo = atual.trim() ? `${atual.trim()}\n\n${texto.trim()}` : texto.trim();

    const resultado = await salvarRascunho({
      agenteId,
      conteudo: montarConteudo(base, { [campo]: novo }),
    });

    if (!resultado.ok) return resultado;
    versaoId = resultado.versaoId ?? null;
  }

  const { error } = await supabase
    .from('sugestoes_ia')
    .update({
      status: 'APROVADA',
      revisado_por: sessao.membro.id,
      revisado_em: new Date().toISOString(),
      versao_gerada_id: versaoId,
    })
    .eq('id', sugestaoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível registrar a aprovação.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_SUGESTAO_APROVADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'sugestoes_ia',
    entidadeId: sugestaoId,
    metadados: { campo, versao_gerada: versaoId },
  });

  revalidatePath('/ia/analise');
  revalidatePath('/ia');

  return {
    ok: true,
    aviso: versaoId
      ? 'Sugestão aplicada num rascunho. Revise em IA > Configuração e publique quando estiver de acordo.'
      : 'Sugestão marcada como aprovada. Ela não tinha texto pronto para aplicar automaticamente.',
  };
}

export async function rejeitarSugestao(sugestaoId: string, observacao?: string): Promise<Resultado> {
  if (!uuid.safeParse(sugestaoId).success) return { ok: false, erro: 'Sugestão inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('sugestoes_ia')
    .update({
      status: 'REJEITADA',
      revisado_por: sessao.membro.id,
      revisado_em: new Date().toISOString(),
      observacao_revisao: observacao?.trim() || null,
    })
    .eq('id', sugestaoId)
    .eq('organizacao_id', sessao.organizacao.id)
    .eq('status', 'PENDENTE');

  if (error) return { ok: false, erro: 'Não foi possível registrar.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.IA_SUGESTAO_REJEITADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'sugestoes_ia',
    entidadeId: sugestaoId,
  });

  revalidatePath('/ia/analise');
  return { ok: true };
}

/** Converte uma linha da tabela no formato do formulário, com sobrescritas. */
function montarConteudo(
  base: VersaoAgenteIa,
  sobrescritas: Record<string, string>,
): ConteudoVersao {
  const ler = (coluna: string, padrao: string) =>
    sobrescritas[coluna] ?? String((base as unknown as Record<string, unknown>)[coluna] ?? padrao);

  return {
    persona: ler('persona', ''),
    // Não é campo de sugestão (ver CAMPOS_PERMITIDOS acima): vem sempre
    // da versão base, nunca de uma sobrescrita de análise.
    nomeExibicao: base.nome_exibicao,
    tom: ler('tom', ''),
    descricaoEmpresa: ler('descricao_empresa', ''),
    servicos: ler('servicos', ''),
    baseConhecimento: ler('base_conhecimento', ''),
    objetivos: ler('objetivos', ''),
    regras: ler('regras', ''),
    limitacoes: ler('limitacoes', ''),
    informacoesProibidas: ler('informacoes_proibidas', ''),
    mensagemFallback: ler('mensagem_fallback', 'Vou chamar um atendente para te ajudar com isso.'),
    perguntas: Array.isArray(base.perguntas) ? (base.perguntas as unknown[]).map(String) : [],
    criteriosTransferencia: Array.isArray(base.criterios_transferencia)
      ? (base.criterios_transferencia as unknown[]).map(String)
      : [],
    horarios:
      base.horarios && typeof base.horarios === 'object' && !Array.isArray(base.horarios)
        ? (base.horarios as Record<string, unknown>)
        : {},
    notas: 'Rascunho com sugestão da análise aplicada.',
  };
}
