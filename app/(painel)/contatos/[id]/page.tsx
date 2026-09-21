import type { Metadata } from 'next';
import { PerfilContato } from '@/componentes/operacao/perfil-contato';
import { notFound } from 'next/navigation';

import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';

import { FichaCompleta } from './ficha';

export const metadata: Metadata = { title: 'Contato' };
export const dynamic = 'force-dynamic';

export default async function PaginaContato({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string|undefined>> }) {
  const { id } = await params;
  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { data: contato } = await supabase
    .from('contatos')
    .select('*')
    .eq('id', id)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!contato) notFound();

  const [
    camposResposta,
    valoresResposta,
    etiquetasResposta,
    etiquetasDoContatoResposta,
    conversasResposta,
    memoriasResposta,
    departamentosResposta,
    membrosResposta,
  ] = await Promise.all([
    supabase
      .from('campos_personalizados')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('valores_campos_contato')
      .select('campo_id, valor, origem')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('contato_id', id),
    supabase.from('etiquetas').select('*').eq('organizacao_id', sessao.organizacao.id).order('nome'),
    supabase
      .from('etiquetas_contato')
      .select('etiqueta_id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('contato_id', id),
    supabase
      .from('conversas')
      .select('id, estado, iniciada_em, encerrada_em, ultima_mensagem_previa, canal_id, campanha_id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('contato_id', id)
      .order('iniciada_em', { ascending: false })
      .limit(20),
    supabase
      .from('memorias_contato')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('contato_id', id)
      .eq('ativo', true)
      .order('atualizado_em', { ascending: false }),
    supabase
      .from('departamentos')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('membros_organizacao')
      .select('id, perfil_id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true),
  ]);

  const membros = membrosResposta.data ?? [];
  const { data: perfis } = membros.length
    ? await supabase.from('perfis').select('id, nome, email').in('id', membros.map((m) => m.perfil_id))
    : { data: [] as { id: string; nome: string; email: string }[] };

  const porPerfil = new Map((perfis ?? []).map((perfil) => [perfil.id, perfil.nome || perfil.email]));
  const valores = new Map((valoresResposta.data ?? []).map((item) => [item.campo_id, item.valor]));

  return <PerfilContato contato={contato} conversas={conversasResposta.data ?? []} membroId={sessao.membro.id} fuso={sessao.organizacao.fuso_horario} parametros={await searchParams}>
<FichaCompleta
        contato={contato}
        campos={(camposResposta.data ?? []).map((campo) => ({
          campo,
          valor: valores.get(campo.id) ?? '',
        }))}
        etiquetas={etiquetasResposta.data ?? []}
        etiquetasAtivas={(etiquetasDoContatoResposta.data ?? []).map((linha) => linha.etiqueta_id)}
        conversas={conversasResposta.data ?? []}
        memorias={memoriasResposta.data ?? []}
        departamentos={departamentosResposta.data ?? []}
        atendentes={membros
          .map((membro) => ({ id: membro.id, nome: porPerfil.get(membro.perfil_id) ?? 'Atendente' }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))}
      />
</PerfilContato>;
}
