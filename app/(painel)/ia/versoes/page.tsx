import type { Metadata } from 'next';
import { exigirPapel, papelAtende } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Cartao, EstadoVazio } from '@/componentes/ui/estrutura';
import { ListaVersoes } from './lista';

export const metadata: Metadata = { title: 'Versões da IA' };
export const dynamic = 'force-dynamic';

export default async function PaginaVersoes() {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: versoes } = await supabase
    .from('versoes_agente_ia')
    .select('*')
    .eq('organizacao_id', sessao.organizacao.id)
    .order('versao', { ascending: false })
    .limit(50);

  const lista = versoes ?? [];

  const idsMembros = [
    ...new Set(
      lista
        .flatMap((versao) => [versao.criado_por, versao.aprovado_por])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: membros } = idsMembros.length
    ? await supabase
        .from('membros_organizacao')
        .select('id, perfil_id')
        .eq('organizacao_id', sessao.organizacao.id)
        .in('id', idsMembros)
    : { data: [] as { id: string; perfil_id: string }[] };

  const { data: perfis } = membros?.length
    ? await supabase.from('perfis').select('id, nome, email').in('id', membros.map((m) => m.perfil_id))
    : { data: [] as { id: string; nome: string; email: string }[] };

  const porPerfil = new Map((perfis ?? []).map((perfil) => [perfil.id, perfil.nome || perfil.email]));
  const nomes = new Map(
    (membros ?? []).map((membro) => [membro.id, porPerfil.get(membro.perfil_id) ?? 'Alguém']),
  );

  if (lista.length === 0) {
    return (
      <Cartao>
        <EstadoVazio
          titulo="Nenhuma versão registrada"
          descricao="A primeira versão nasce junto com a organização. Se não existe, o provisionamento não terminou."
        />
      </Cartao>
    );
  }

  return (
    <ListaVersoes
      versoes={lista}
      nomes={Object.fromEntries(nomes)}
      podeEditar={papelAtende(sessao.papel, 'ADMIN')}
    />
  );
}
