'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirPapel } from '@/lib/sessao';
import { urlAutorizacao, indiceDaColuna } from '@/lib/integracoes/google';
import { enfileirar, FILAS } from '@/lib/filas/produtor';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { integracaoConfigurada, ErroConfiguracao } from '@/lib/ambiente';
import type { Json } from '@/lib/tipos-banco';

export interface Resultado {
  ok: boolean;
  erro?: string;
  aviso?: string;
  url?: string;
}

const uuid = z.string().uuid();

/**
 * Começa a autorização com o Google.
 *
 * O `state` carrega a organização e um valor aleatório. No retorno, ele é
 * conferido — é o que impede alguém de forjar o callback e ligar a conta
 * Google dele à organização de outra pessoa.
 */
export async function iniciarConexaoGoogle(): Promise<Resultado> {
  const sessao = await exigirPapel('ADMIN');

  if (!integracaoConfigurada('GOOGLE_SHEETS')) {
    return {
      ok: false,
      erro: 'Google não configurado. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local — passo a passo em OWNER_SETUP_GUIDE.md, seção GOOGLE SHEETS.',
    };
  }

  const supabase = await clienteServidor();
  const aleatorio = crypto.randomUUID();

  const { data: integracao, error } = await supabase
    .from('integracoes')
    .upsert(
      {
        organizacao_id: sessao.organizacao.id,
        tipo: 'GOOGLE_SHEETS',
        nome: 'Google Sheets',
        status: 'DESCONECTADA',
        configuracao: { estado_oauth: aleatorio } as Json,
        criado_por: sessao.membro.id,
      },
      { onConflict: 'organizacao_id,tipo,nome' },
    )
    .select('id')
    .single();

  if (error) return { ok: false, erro: 'Não foi possível preparar a conexão.' };

  try {
    return {
      ok: true,
      url: urlAutorizacao(`${integracao.id}:${aleatorio}`),
    };
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return { ok: false, erro: erro.message };
    throw erro;
  }
}

export async function desconectarGoogle(integracaoId: string): Promise<Resultado> {
  if (!uuid.safeParse(integracaoId).success) return { ok: false, erro: 'Integração inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('integracoes')
    .update({ credenciais: {} as Json, status: 'DESCONECTADA', conta_externa: null })
    .eq('id', integracaoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível desconectar.' };

  await supabase
    .from('integracoes_google_sheets')
    .update({ ativo: false })
    .eq('integracao_id', integracaoId)
    .eq('organizacao_id', sessao.organizacao.id);

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.INTEGRACAO_DESCONECTADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'integracoes',
    entidadeId: integracaoId,
  });

  revalidatePath('/integracoes/google-sheets');
  return { ok: true, aviso: 'As planilhas ligadas a esta conta foram desativadas.' };
}

const esquemaPlanilha = z.object({
  integracaoId: uuid,
  planilhaId: z.string().trim().min(10, 'Cole o ID ou o link da planilha'),
  aba: z.string().trim().min(1).max(80),
  colunaTelefone: z.string().trim().regex(/^[A-Za-z]{1,3}$/, 'Use a letra da coluna, ex.: B'),
  colunaNome: z.string().trim().max(3),
  colunaIdentificadora: z.string().trim().max(3),
  primeiraLinha: z.number().int().min(1).max(1000),
  intervaloMinutos: z.number().int().min(5).max(1440),
  etiquetaId: uuid.nullable(),
  campanhaId: uuid.nullable(),
  mapeamentoCampos: z.array(z.object({ chave: z.string(), coluna: z.string().max(3) })).max(30),
});

/** Aceita tanto o ID puro quanto o link inteiro da planilha. */
function extrairIdPlanilha(entrada: string): string {
  const casamento = entrada.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return casamento?.[1] ?? entrada.trim();
}

export async function salvarPlanilha(
  entrada: z.infer<typeof esquemaPlanilha> & { planilhaExistenteId?: string | null },
): Promise<Resultado> {
  const conferido = esquemaPlanilha.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const mapeamento: Record<string, string> = {
    telefone: conferido.data.colunaTelefone.toUpperCase(),
  };

  if (conferido.data.colunaNome.trim()) {
    mapeamento.nome = conferido.data.colunaNome.toUpperCase();
  }

  for (const item of conferido.data.mapeamentoCampos) {
    if (item.coluna.trim() && indiceDaColuna(item.coluna) >= 0) {
      mapeamento[`campo:${item.chave}`] = item.coluna.toUpperCase();
    }
  }

  const dados = {
    organizacao_id: sessao.organizacao.id,
    integracao_id: conferido.data.integracaoId,
    planilha_id: extrairIdPlanilha(conferido.data.planilhaId),
    aba: conferido.data.aba,
    coluna_identificadora: conferido.data.colunaIdentificadora.toUpperCase() || null,
    mapeamento_colunas: mapeamento as unknown as Json,
    primeira_linha_dados: conferido.data.primeiraLinha,
    intervalo_minutos: conferido.data.intervaloMinutos,
    etiqueta_id: conferido.data.etiquetaId,
    campanha_id: conferido.data.campanhaId,
    ativo: true,
  };

  const { error } = entrada.planilhaExistenteId
    ? await supabase
        .from('integracoes_google_sheets')
        .update(dados)
        .eq('id', entrada.planilhaExistenteId)
        .eq('organizacao_id', sessao.organizacao.id)
    : await supabase.from('integracoes_google_sheets').insert(dados);

  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath('/integracoes/google-sheets');
  return { ok: true };
}

export async function sincronizarAgora(planilhaId: string): Promise<Resultado> {
  if (!uuid.safeParse(planilhaId).success) return { ok: false, erro: 'Planilha inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data: planilha } = await supabase
    .from('integracoes_google_sheets')
    .select('id')
    .eq('id', planilhaId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!planilha) return { ok: false, erro: 'Planilha não encontrada.' };

  try {
    const resultado = await enfileirar(
      FILAS.sincronizacaoPlanilhas,
      { integracaoSheetsId: planilhaId, organizacaoId: sessao.organizacao.id },
      { id: `planilha:${planilhaId}:manual:${Date.now()}` },
    );

    if (resultado === 'DELEGADO') {
      // Sem fila neste processo: zerar a data da última sincronização faz a
      // varredura do worker tratar a planilha como vencida na próxima volta.
      await supabase
        .from('integracoes_google_sheets')
        .update({ ultima_sincronizacao_em: null })
        .eq('id', planilhaId)
        .eq('organizacao_id', sessao.organizacao.id);

      revalidatePath('/integracoes/google-sheets');
      return {
        ok: true,
        aviso: 'Sincronização agendada. Os contatos aparecem em até um minuto — atualize a página.',
      };
    }
  } catch (erro) {
    return {
      ok: false,
      erro: `Não foi possível enfileirar: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
    };
  }

  revalidatePath('/integracoes/google-sheets');
  return { ok: true, aviso: 'Sincronização enfileirada. Atualize a página em alguns segundos.' };
}

export async function desativarPlanilha(planilhaId: string, ativo: boolean): Promise<Resultado> {
  if (!uuid.safeParse(planilhaId).success) return { ok: false, erro: 'Planilha inválida' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('integracoes_google_sheets')
    .update({ ativo })
    .eq('id', planilhaId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar.' };

  revalidatePath('/integracoes/google-sheets');
  return { ok: true };
}
