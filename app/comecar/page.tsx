import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { sessaoAtual } from '@/lib/sessao';
import { FormularioOrganizacao } from './formulario';

export const metadata: Metadata = { title: 'Criar organização' };

export default async function PaginaComecar() {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/entrar');

  // Quem já tem organização não passa por aqui de novo.
  const sessao = await sessaoAtual();
  if (sessao) redirect('/atendimento');

  return (
    <main className="flex min-h-screen items-center justify-center bg-tela px-6 py-14">
      <FormularioOrganizacao nomeUsuario={user.user_metadata?.nome ?? user.email ?? ''} />
    </main>
  );
}
