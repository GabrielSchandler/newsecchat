'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirSessao } from '@/lib/sessao';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const uuid = z.string().uuid();

export async function salvarContato(entrada: {
  contatoId: string;
  nome: string | null;
  email: string | null;
  documento: string | null;
  observacoes: string | null;
  responsavelId: string | null;
  departamentoId: string | null;
  ehCliente: boolean;
  campos: { chave: string; valor: string }[];
}): Promise<Resultado> {
  const conferido = z
    .object({
      contatoId: uuid,
      nome: z.string().trim().max(120).nullable(),
      email: z.string().trim().email('E-mail inválido').max(160).nullable().or(z.literal('')),
      documento: z.string().trim().max(24).nullable(),
      observacoes: z.string().trim().max(4000).nullable(),
      responsavelId: uuid.nullable(),
      departamentoId: uuid.nullable(),
      ehCliente: z.boolean(),
      campos: z.array(z.object({ chave: z.string(), valor: z.string().max(500) })).max(50),
    })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('contatos')
    .update({
      nome: conferido.data.nome || null,
      email: conferido.data.email || null,
      documento: conferido.data.documento || null,
      observacoes: conferido.data.observacoes || null,
      responsavel_id: conferido.data.responsavelId,
      departamento_id: conferido.data.departamentoId,
      eh_cliente: conferido.data.ehCliente,
    })
    .eq('id', conferido.data.contatoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar o contato.' };

  // Os campos personalizados vêm por chave; a gravação precisa do id.
  if (conferido.data.campos.length) {
    const { data: definicoes } = await supabase
      .from('campos_personalizados')
      .select('id, chave')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true);

    const porChave = new Map((definicoes ?? []).map((campo) => [campo.chave, campo.id]));

    const paraGravar = conferido.data.campos
      .filter((campo) => porChave.has(campo.chave) && campo.valor.trim())
      .map((campo) => ({
        organizacao_id: sessao.organizacao.id,
        contato_id: conferido.data.contatoId,
        campo_id: porChave.get(campo.chave) as string,
        valor: campo.valor.trim(),
        // Marcar a origem como ATENDENTE importa: o que uma pessoa
        // digitou tem precedência sobre o que a IA deduziu.
        origem: 'ATENDENTE' as const,
        atualizado_em: new Date().toISOString(),
      }));

    const paraApagar = conferido.data.campos
      .filter((campo) => porChave.has(campo.chave) && !campo.valor.trim())
      .map((campo) => porChave.get(campo.chave) as string);

    if (paraGravar.length) {
      await supabase
        .from('valores_campos_contato')
        .upsert(paraGravar, { onConflict: 'contato_id,campo_id' });
    }

    if (paraApagar.length) {
      await supabase
        .from('valores_campos_contato')
        .delete()
        .eq('contato_id', conferido.data.contatoId)
        .eq('organizacao_id', sessao.organizacao.id)
        .in('campo_id', paraApagar);
    }
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONTATO_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'contatos',
    entidadeId: conferido.data.contatoId,
  });

  revalidatePath(`/contatos/${conferido.data.contatoId}`);
  revalidatePath('/contatos');
  return { ok: true };
}

/**
 * Opt-out de campanha.
 *
 * Uma vez desligado, nenhuma campanha volta a incluir o contato — a
 * verificação acontece na hora do envio, não só na montagem da lista.
 */
export async function definirAceiteCampanha(
  contatoId: string,
  aceita: boolean,
  motivo?: string,
): Promise<Resultado> {
  if (!uuid.safeParse(contatoId).success) return { ok: false, erro: 'Contato inválido' };

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('contatos')
    .update({
      aceita_campanha: aceita,
      opt_out_em: aceita ? null : new Date().toISOString(),
      opt_out_motivo: aceita ? null : motivo?.trim() || 'Registrado manualmente',
    })
    .eq('id', contatoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONTATO_OPT_OUT,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'contatos',
    entidadeId: contatoId,
    metadados: { aceita_campanha: aceita, motivo: motivo ?? null },
  });

  revalidatePath(`/contatos/${contatoId}`);
  return { ok: true };
}

export async function definirBloqueio(contatoId: string, bloqueado: boolean): Promise<Resultado> {
  if (!uuid.safeParse(contatoId).success) return { ok: false, erro: 'Contato inválido' };

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('contatos')
    .update({ bloqueado })
    .eq('id', contatoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONTATO_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'contatos',
    entidadeId: contatoId,
    metadados: { bloqueado },
  });

  revalidatePath(`/contatos/${contatoId}`);
  return { ok: true };
}

export async function alternarEtiquetaContato(
  contatoId: string,
  etiquetaId: string,
  ativar: boolean,
): Promise<Resultado> {
  if (!uuid.safeParse(contatoId).success || !uuid.safeParse(etiquetaId).success) {
    return { ok: false, erro: 'Dados inválidos' };
  }

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  if (ativar) {
    const { error } = await supabase.from('etiquetas_contato').upsert(
      { organizacao_id: sessao.organizacao.id, contato_id: contatoId, etiqueta_id: etiquetaId },
      { onConflict: 'contato_id,etiqueta_id', ignoreDuplicates: true },
    );
    if (error) return { ok: false, erro: 'Não foi possível aplicar a etiqueta.' };
  } else {
    const { error } = await supabase
      .from('etiquetas_contato')
      .delete()
      .eq('contato_id', contatoId)
      .eq('etiqueta_id', etiquetaId)
      .eq('organizacao_id', sessao.organizacao.id);
    if (error) return { ok: false, erro: 'Não foi possível remover a etiqueta.' };
  }

  revalidatePath(`/contatos/${contatoId}`);
  return { ok: true };
}
