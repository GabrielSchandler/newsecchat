'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { exigirPapel } from '@/lib/sessao';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { gerarApelido } from '@/lib/utilitarios';
import { ambientePublico } from '@/lib/ambiente';
import { log } from '@/lib/log';
import type { PapelMembro, TipoCampo } from '@/lib/tipos-banco';

export interface Resultado {
  ok: boolean;
  erro?: string;
  aviso?: string;
  convite?: { email: string; url: string };
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------------
// Organização
// ---------------------------------------------------------------------

export async function salvarOrganizacao(entrada: {
  nome: string;
  fusoHorario: string;
  documento: string | null;
}): Promise<Resultado> {
  const conferido = z
    .object({
      nome: z.string().trim().min(2, 'Informe o nome').max(120),
      fusoHorario: z.string().trim().min(3),
      documento: z.string().trim().max(20).nullable(),
    })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('organizacoes')
    .update({
      nome: conferido.data.nome,
      fuso_horario: conferido.data.fusoHorario,
      documento: conferido.data.documento || null,
    })
    .eq('id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.ORGANIZACAO_ATUALIZADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'organizacoes',
    entidadeId: sessao.organizacao.id,
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Departamentos
// ---------------------------------------------------------------------

const esquemaDepartamento = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(60),
  descricao: z.string().trim().max(400).nullable(),
  criterioTransferencia: z.string().trim().max(600).nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
});

export async function criarDepartamento(entrada: {
  nome: string;
  descricao: string | null;
  criterioTransferencia: string | null;
  cor: string;
}): Promise<Resultado> {
  const conferido = esquemaDepartamento.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { count } = await supabase
    .from('departamentos')
    .select('id', { count: 'exact', head: true })
    .eq('organizacao_id', sessao.organizacao.id);

  const { data, error } = await supabase
    .from('departamentos')
    .insert({
      organizacao_id: sessao.organizacao.id,
      nome: conferido.data.nome,
      chave: gerarApelido(conferido.data.nome) || `departamento-${(count ?? 0) + 1}`,
      descricao: conferido.data.descricao,
      criterio_transferencia: conferido.data.criterioTransferencia,
      cor: conferido.data.cor,
      ordem: (count ?? 0) + 1,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Já existe um departamento com esse nome.' };
    }
    return { ok: false, erro: 'Não foi possível criar o departamento.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.DEPARTAMENTO_CRIADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'departamentos',
    entidadeId: data.id,
    metadados: { nome: conferido.data.nome },
  });

  revalidatePath('/configuracoes/departamentos');
  return { ok: true };
}

export async function salvarDepartamento(entrada: {
  departamentoId: string;
  nome: string;
  descricao: string | null;
  criterioTransferencia: string | null;
  cor: string;
  ativo: boolean;
}): Promise<Resultado> {
  const conferido = esquemaDepartamento
    .extend({ departamentoId: uuid, ativo: z.boolean() })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('departamentos')
    .update({
      nome: conferido.data.nome,
      descricao: conferido.data.descricao,
      criterio_transferencia: conferido.data.criterioTransferencia,
      cor: conferido.data.cor,
      ativo: conferido.data.ativo,
    })
    .eq('id', conferido.data.departamentoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar o departamento.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.DEPARTAMENTO_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'departamentos',
    entidadeId: conferido.data.departamentoId,
  });

  revalidatePath('/configuracoes/departamentos');
  return { ok: true };
}

export async function removerDepartamento(departamentoId: string): Promise<Resultado> {
  if (!uuid.safeParse(departamentoId).success) return { ok: false, erro: 'Departamento inválido' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { count } = await supabase
    .from('conversas')
    .select('id', { count: 'exact', head: true })
    .eq('departamento_id', departamentoId)
    .neq('estado', 'ENCERRADA');

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: `Existem ${count} conversa(s) abertas neste departamento. Transfira-as antes, ou apenas desative o departamento.`,
    };
  }

  const { error } = await supabase
    .from('departamentos')
    .delete()
    .eq('id', departamentoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível remover o departamento.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.DEPARTAMENTO_REMOVIDO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'departamentos',
    entidadeId: departamentoId,
  });

  revalidatePath('/configuracoes/departamentos');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Campos personalizados
// ---------------------------------------------------------------------

const TIPOS_CAMPO: TipoCampo[] = [
  'TEXTO',
  'TEXTO_LONGO',
  'NUMERO',
  'MOEDA',
  'DATA',
  'SELECAO',
  'MULTISELECAO',
  'BOOLEANO',
  'TELEFONE',
  'EMAIL',
  'DOCUMENTO',
];

const esquemaCampo = z.object({
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(60),
  tipo: z.enum(TIPOS_CAMPO as [TipoCampo, ...TipoCampo[]]),
  instrucaoIa: z.string().trim().max(500).nullable(),
  obrigatorio: z.boolean(),
  opcoes: z.array(z.string().trim().min(1)).max(30),
});

export async function criarCampo(entrada: {
  rotulo: string;
  tipo: TipoCampo;
  instrucaoIa: string | null;
  obrigatorio: boolean;
  opcoes: string[];
}): Promise<Resultado> {
  const conferido = esquemaCampo.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const chave = gerarApelido(conferido.data.rotulo).replace(/-/g, '_');
  if (!chave) return { ok: false, erro: 'O rótulo precisa ter letras ou números.' };

  const { count } = await supabase
    .from('campos_personalizados')
    .select('id', { count: 'exact', head: true })
    .eq('organizacao_id', sessao.organizacao.id);

  const { data, error } = await supabase
    .from('campos_personalizados')
    .insert({
      organizacao_id: sessao.organizacao.id,
      chave,
      rotulo: conferido.data.rotulo,
      tipo: conferido.data.tipo,
      instrucao_ia: conferido.data.instrucaoIa,
      obrigatorio_para_qualificacao: conferido.data.obrigatorio,
      opcoes: conferido.data.opcoes,
      ordem: (count ?? 0) + 1,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Já existe um campo com esse nome.' };
    return { ok: false, erro: 'Não foi possível criar o campo.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CAMPO_CRIADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'campos_personalizados',
    entidadeId: data.id,
    metadados: { chave, tipo: conferido.data.tipo },
  });

  revalidatePath('/configuracoes/campos');
  return { ok: true };
}

export async function salvarCampo(entrada: {
  campoId: string;
  rotulo: string;
  tipo: TipoCampo;
  instrucaoIa: string | null;
  obrigatorio: boolean;
  opcoes: string[];
  ativo: boolean;
}): Promise<Resultado> {
  const conferido = esquemaCampo
    .extend({ campoId: uuid, ativo: z.boolean() })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  // A chave não muda depois de criada: ela aparece na mensagem das
  // campanhas ({{banco}}) e no mapeamento das planilhas. Renomear
  // silenciosamente quebraria as duas coisas.
  const { error } = await supabase
    .from('campos_personalizados')
    .update({
      rotulo: conferido.data.rotulo,
      tipo: conferido.data.tipo,
      instrucao_ia: conferido.data.instrucaoIa,
      obrigatorio_para_qualificacao: conferido.data.obrigatorio,
      opcoes: conferido.data.opcoes,
      ativo: conferido.data.ativo,
    })
    .eq('id', conferido.data.campoId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar o campo.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CAMPO_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'campos_personalizados',
    entidadeId: conferido.data.campoId,
  });

  revalidatePath('/configuracoes/campos');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------

const PAPEIS: PapelMembro[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ATENDENTE'];

export async function convidarUsuario(entrada: {
  email: string;
  papel: PapelMembro;
  departamentos: string[];
}): Promise<Resultado> {
  const conferido = z
    .object({
      email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
      papel: z.enum(PAPEIS as [PapelMembro, ...PapelMembro[]]),
      departamentos: z.array(uuid).max(20),
    })
    .safeParse(entrada);

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');

  // Só o dono cria outro dono. Um administrador não promove ninguém acima
  // do próprio papel.
  if (conferido.data.papel === 'SUPER_ADMIN' && sessao.papel !== 'SUPER_ADMIN') {
    return { ok: false, erro: 'Só o proprietário pode criar outro proprietário.' };
  }

  const supabase = await clienteServidor();

  const { data: convite, error } = await supabase
    .from('convites')
    .upsert(
      {
        organizacao_id: sessao.organizacao.id,
        email: conferido.data.email,
        papel: conferido.data.papel,
        departamentos: conferido.data.departamentos,
        criado_por: sessao.membro.id,
        aceito_em: null,
        expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'organizacao_id,email' },
    )
    .select('token, email')
    .single();

  if (error) {
    log.error('Falha ao criar convite', { erro: error.message });
    return { ok: false, erro: 'Não foi possível criar o convite.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.USUARIO_CONVIDADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'convites',
    entidadeId: conferido.data.email,
    metadados: { papel: conferido.data.papel },
  });

  revalidatePath('/configuracoes/usuarios');

  // O envio de e-mail depende de servidor de e-mail configurado, que este
  // projeto não assume ter. O link é devolvido para o gestor repassar —
  // explícito, em vez de um "convite enviado" que nunca chega.
  return {
    ok: true,
    convite: {
      email: convite.email,
      url: `${ambientePublico.urlAplicacao.replace(/\/+$/, '')}/convite/${convite.token}`,
    },
  };
}

export async function alterarPapel(membroId: string, papel: PapelMembro): Promise<Resultado> {
  if (!uuid.safeParse(membroId).success) return { ok: false, erro: 'Usuário inválido' };
  if (!PAPEIS.includes(papel)) return { ok: false, erro: 'Papel inválido' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  if (membroId === sessao.membro.id) {
    return {
      ok: false,
      erro: 'Você não pode alterar o próprio papel. Peça a outro administrador.',
    };
  }

  if (papel === 'SUPER_ADMIN' && sessao.papel !== 'SUPER_ADMIN') {
    return { ok: false, erro: 'Só o proprietário pode criar outro proprietário.' };
  }

  const { data: alvo } = await supabase
    .from('membros_organizacao')
    .select('papel')
    .eq('id', membroId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!alvo) return { ok: false, erro: 'Usuário não encontrado' };

  if (alvo.papel === 'SUPER_ADMIN' && sessao.papel !== 'SUPER_ADMIN') {
    return { ok: false, erro: 'Só o proprietário pode alterar outro proprietário.' };
  }

  const { error } = await supabase
    .from('membros_organizacao')
    .update({ papel })
    .eq('id', membroId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar o papel.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.USUARIO_PAPEL_ALTERADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'membros_organizacao',
    entidadeId: membroId,
    metadados: { de: alvo.papel, para: papel },
  });

  revalidatePath('/configuracoes/usuarios');
  return { ok: true };
}

export async function alterarSituacaoUsuario(membroId: string, ativo: boolean): Promise<Resultado> {
  if (!uuid.safeParse(membroId).success) return { ok: false, erro: 'Usuário inválido' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  if (membroId === sessao.membro.id) {
    return { ok: false, erro: 'Você não pode desativar a si mesmo.' };
  }

  // Desativar o último proprietário deixaria a organização sem quem possa
  // reativar ninguém.
  if (!ativo) {
    const { count } = await supabase
      .from('membros_organizacao')
      .select('id', { count: 'exact', head: true })
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('papel', 'SUPER_ADMIN')
      .eq('ativo', true);

    const { data: alvo } = await supabase
      .from('membros_organizacao')
      .select('papel')
      .eq('id', membroId)
      .maybeSingle();

    if (alvo?.papel === 'SUPER_ADMIN' && (count ?? 0) <= 1) {
      return { ok: false, erro: 'Este é o único proprietário. Promova outra pessoa antes.' };
    }
  }

  const { error } = await supabase
    .from('membros_organizacao')
    .update({ ativo })
    .eq('id', membroId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar a situação.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ativo ? ACOES.USUARIO_REATIVADO : ACOES.USUARIO_DESATIVADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'membros_organizacao',
    entidadeId: membroId,
  });

  revalidatePath('/configuracoes/usuarios');

  // Uma conversa presa com atendente desativado nunca mais seria atendida.
  if (!ativo) {
    const admin = clienteAdministrador();
    const { count } = await admin
      .from('conversas')
      .select('id', { count: 'exact', head: true })
      .eq('responsavel_id', membroId)
      .neq('estado', 'ENCERRADA');

    if ((count ?? 0) > 0) {
      await admin
        .from('conversas')
        .update({ responsavel_id: null, estado: 'AGUARDANDO_HUMANO' })
        .eq('responsavel_id', membroId)
        .neq('estado', 'ENCERRADA');

      return {
        ok: true,
        aviso: `${count} conversa(s) que estavam com esta pessoa voltaram para a fila "Aguardando humano".`,
      };
    }
  }

  return { ok: true };
}

export async function definirDepartamentosDoUsuario(
  membroId: string,
  departamentos: string[],
): Promise<Resultado> {
  const conferido = z
    .object({ membroId: uuid, departamentos: z.array(uuid).max(20) })
    .safeParse({ membroId, departamentos });

  if (!conferido.success) return { ok: false, erro: 'Dados inválidos' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error: erroLimpeza } = await supabase
    .from('membros_departamento')
    .delete()
    .eq('membro_id', membroId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (erroLimpeza) return { ok: false, erro: 'Não foi possível atualizar os departamentos.' };

  if (conferido.data.departamentos.length) {
    const { error } = await supabase.from('membros_departamento').insert(
      conferido.data.departamentos.map((departamentoId) => ({
        organizacao_id: sessao.organizacao.id,
        membro_id: membroId,
        departamento_id: departamentoId,
      })),
    );

    if (error) return { ok: false, erro: 'Não foi possível vincular os departamentos.' };
  }

  revalidatePath('/configuracoes/usuarios');
  return { ok: true };
}
