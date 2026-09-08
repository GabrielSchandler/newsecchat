import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PainelDepartamentos } from './painel';

export const metadata: Metadata = { title: 'Departamentos' };
export const dynamic = 'force-dynamic';

export default async function PaginaDepartamentos() {
  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data } = await supabase
    .from('departamentos')
    .select('*')
    .eq('organizacao_id', sessao.organizacao.id)
    .order('ordem');

  return <PainelDepartamentos departamentos={data ?? []} />;
}
