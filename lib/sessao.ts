import 'server-only';

/**
 * Sessão do usuário no servidor.
 *
 * Toda página e toda Server Action começa por aqui. O que este arquivo
 * devolve é a única fonte de "quem é o usuário e em qual organização ele
 * está" — nenhuma tela recebe organizacao_id por parâmetro de URL, porque
 * parâmetro o usuário edita.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { papelAtende } from '@/lib/papeis';
import type { Departamento, MembroOrganizacao, Organizacao, PapelMembro, Perfil } from '@/lib/tipos-banco';

export interface SessaoAtual {
  perfil: Perfil;
  organizacao: Organizacao;
  membro: MembroOrganizacao;
  papel: PapelMembro;
  departamentos: Departamento[];
}

/**
 * `cache` do React deduplica a consulta dentro de uma mesma renderização:
 * dez componentes chamando `sessaoAtual()` fazem uma consulta, não dez.
 */
export const sessaoAtual = cache(async (): Promise<SessaoAtual | null> => {
  const supabase = await clienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle();
  if (!perfil) return null;

  const { data: membro } = await supabase
    .from('membros_organizacao')
    .select('*')
    .eq('perfil_id', user.id)
    .eq('ativo', true)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membro) return null;

  const { data: organizacao } = await supabase
    .from('organizacoes')
    .select('*')
    .eq('id', membro.organizacao_id)
    .maybeSingle();

  if (!organizacao) return null;

  const { data: vinculos } = await supabase
    .from('membros_departamento')
    .select('departamento_id, departamentos(*)')
    .eq('membro_id', membro.id);

  const departamentos = (vinculos ?? [])
    .map((vinculo) => vinculo.departamentos as unknown as Departamento | null)
    .filter((item): item is Departamento => Boolean(item));

  return {
    perfil,
    organizacao,
    membro,
    papel: membro.papel,
    departamentos,
  };
});

/**
 * Sessão obrigatória. Sem usuário, manda para o login; com usuário mas
 * sem organização, manda para a criação da organização.
 */
export async function exigirSessao(): Promise<SessaoAtual> {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/entrar');

  const sessao = await sessaoAtual();
  if (!sessao) redirect('/comecar');

  return sessao;
}

export async function exigirPapel(minimo: PapelMembro): Promise<SessaoAtual> {
  const sessao = await exigirSessao();

  if (!papelAtende(sessao.papel, minimo)) {
    redirect('/painel?erro=sem-permissao');
  }

  return sessao;
}

export { rotuloPapel, papelAtende } from '@/lib/papeis';
