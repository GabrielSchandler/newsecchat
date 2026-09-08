import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PainelUsuarios, type UsuarioDaLista } from './painel';

export const metadata: Metadata = { title: 'Usuários' };
export const dynamic = 'force-dynamic';

export default async function PaginaUsuarios() {
  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const [membrosResposta, departamentosResposta, convitesResposta] = await Promise.all([
    supabase
      .from('membros_organizacao')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .order('criado_em'),
    supabase
      .from('departamentos')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('convites')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .is('aceito_em', null)
      .order('criado_em', { ascending: false }),
  ]);

  const membros = membrosResposta.data ?? [];

  const [perfisResposta, vinculosResposta] = await Promise.all([
    membros.length
      ? supabase.from('perfis').select('id, nome, email').in('id', membros.map((m) => m.perfil_id))
      : Promise.resolve({ data: [] as { id: string; nome: string; email: string }[] }),
    membros.length
      ? supabase
          .from('membros_departamento')
          .select('membro_id, departamento_id')
          .eq('organizacao_id', sessao.organizacao.id)
      : Promise.resolve({ data: [] as { membro_id: string; departamento_id: string }[] }),
  ]);

  const porPerfil = new Map((perfisResposta.data ?? []).map((perfil) => [perfil.id, perfil]));

  const vinculos = new Map<string, string[]>();
  for (const vinculo of vinculosResposta.data ?? []) {
    const atual = vinculos.get(vinculo.membro_id) ?? [];
    atual.push(vinculo.departamento_id);
    vinculos.set(vinculo.membro_id, atual);
  }

  const usuarios: UsuarioDaLista[] = membros.map((membro) => {
    const perfil = porPerfil.get(membro.perfil_id);
    return {
      membroId: membro.id,
      nome: perfil?.nome || perfil?.email || 'Sem nome',
      email: perfil?.email ?? '',
      papel: membro.papel,
      ativo: membro.ativo,
      departamentos: vinculos.get(membro.id) ?? [],
      souEu: membro.id === sessao.membro.id,
    };
  });

  return (
    <PainelUsuarios
      usuarios={usuarios}
      departamentos={departamentosResposta.data ?? []}
      convites={(convitesResposta.data ?? []).map((convite) => ({
        id: convite.id,
        email: convite.email,
        papel: convite.papel,
        expiraEm: convite.expira_em,
      }))}
      meuPapel={sessao.papel}
    />
  );
}
