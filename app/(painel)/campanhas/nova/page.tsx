import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { AvisoConfiguracao } from '@/componentes/ui/estrutura';
import { FormularioCampanha } from './formulario';

export const metadata: Metadata = { title: 'Nova campanha' };
export const dynamic = 'force-dynamic';

export default async function PaginaNovaCampanha() {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const [canaisResposta, departamentosResposta, camposResposta] = await Promise.all([
    supabase
      .from('canais')
      .select('id, nome, status, ativo')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('nome'),
    supabase
      .from('departamentos')
      .select('id, nome')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('campos_personalizados')
      .select('chave, rotulo')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
  ]);

  const canais = canaisResposta.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
      <Link
        href="/campanhas"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-bruma-600 transition-colors hover:text-tinta-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Todas as campanhas
      </Link>

      <h1 className="text-[22px] font-semibold tracking-tight text-tinta-950">Nova campanha</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-bruma-600">
        Depois de criar, você escolhe os destinatários e só então inicia. Nada é enviado até você
        apertar iniciar.
      </p>

      {canais.length === 0 ? (
        <AvisoConfiguracao
          className="mt-5"
          titulo="Nenhum canal disponível"
          orientacao="Cadastre e conecte um número em Configurações > Canais de WhatsApp antes de criar uma campanha."
        />
      ) : (
        <FormularioCampanha
          canais={canais}
          departamentos={departamentosResposta.data ?? []}
          campos={camposResposta.data ?? []}
        />
      )}
    </div>
  );
}
