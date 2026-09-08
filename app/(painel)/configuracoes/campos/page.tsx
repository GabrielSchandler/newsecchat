import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PainelCampos } from './painel';

export const metadata: Metadata = { title: 'Campos do contato' };
export const dynamic = 'force-dynamic';

export default async function PaginaCampos() {
  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data } = await supabase
    .from('campos_personalizados')
    .select('*')
    .eq('organizacao_id', sessao.organizacao.id)
    .order('ordem');

  return <PainelCampos campos={data ?? []} />;
}
