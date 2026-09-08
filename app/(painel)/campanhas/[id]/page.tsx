import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PainelCampanha } from './painel';

export const metadata: Metadata = { title: 'Campanha' };
export const dynamic = 'force-dynamic';

export default async function PaginaCampanha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: campanha } = await supabase
    .from('campanhas')
    .select('*')
    .eq('id', id)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!campanha) notFound();

  const [canalResposta, etiquetasResposta, destinatariosResposta] = await Promise.all([
    supabase
      .from('canais')
      .select('id, nome, status, ativo')
      .eq('id', campanha.canal_id)
      .maybeSingle(),
    supabase.from('etiquetas').select('*').eq('organizacao_id', sessao.organizacao.id).order('nome'),
    supabase
      .from('contatos_campanha')
      .select('id, contato_id, status, erro, motivo_ignorado, enviado_em, respondido_em, conversa_id')
      .eq('campanha_id', id)
      .order('criado_em')
      .limit(200),
  ]);

  const destinatarios = destinatariosResposta.data ?? [];

  const { data: contatos } = destinatarios.length
    ? await supabase
        .from('contatos')
        .select('id, nome, telefone')
        .eq('organizacao_id', sessao.organizacao.id)
        .in('id', destinatarios.map((item) => item.contato_id))
    : { data: [] as { id: string; nome: string | null; telefone: string }[] };

  const porContato = new Map((contatos ?? []).map((contato) => [contato.id, contato]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
      <Link
        href="/campanhas"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-bruma-600 transition-colors hover:text-tinta-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Todas as campanhas
      </Link>

      <PainelCampanha
        campanha={campanha}
        canal={canalResposta.data ?? null}
        etiquetas={etiquetasResposta.data ?? []}
        destinatarios={destinatarios.map((item) => ({
          ...item,
          nome: porContato.get(item.contato_id)?.nome ?? null,
          telefone: porContato.get(item.contato_id)?.telefone ?? '',
        }))}
        fusoHorario={sessao.organizacao.fuso_horario}
      />
    </div>
  );
}
