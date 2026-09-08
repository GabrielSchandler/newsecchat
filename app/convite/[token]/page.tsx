import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { FormularioConvite } from './formulario';

export const metadata: Metadata = { title: 'Convite' };
export const dynamic = 'force-dynamic';

export default async function PaginaConvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Lido com a chave de serviço: quem abre o convite ainda não pertence a
  // organização nenhuma, então o RLS o esconderia dele mesmo.
  const { data: convite } = await clienteAdministrador()
    .from('convites')
    .select('email, papel, expira_em, aceito_em, organizacao_id')
    .eq('token', token)
    .maybeSingle();

  if (!convite) return <Aviso titulo="Convite não encontrado" texto="O link pode estar incompleto ou o convite foi cancelado. Peça um novo a quem te convidou." />;

  if (convite.aceito_em) {
    return (
      <Aviso
        titulo="Este convite já foi usado"
        texto="Se a conta já é sua, é só entrar normalmente."
        acao={{ rotulo: 'Ir para o login', href: '/entrar' }}
      />
    );
  }

  if (new Date(convite.expira_em) < new Date()) {
    return <Aviso titulo="Convite expirado" texto="Convites valem por 7 dias. Peça um novo a quem te convidou." />;
  }

  const { data: organizacao } = await clienteAdministrador()
    .from('organizacoes')
    .select('nome')
    .eq('id', convite.organizacao_id)
    .maybeSingle();

  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Já logado com o e-mail certo: aceita direto, sem criar conta de novo.
  if (user && user.email?.toLowerCase() === convite.email.toLowerCase()) {
    const { error } = await supabase.rpc('aceitar_convite', { p_token: token });
    if (!error) redirect('/atendimento');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta-950 px-6 py-14">
      <FormularioConvite
        token={token}
        email={convite.email}
        nomeOrganizacao={organizacao?.nome ?? 'a equipe'}
        jaLogadoComOutroEmail={Boolean(user && user.email?.toLowerCase() !== convite.email.toLowerCase())}
        emailAtual={user?.email ?? null}
      />
    </main>
  );
}

function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: { rotulo: string; href: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta-950 px-6 py-14">
      <div className="w-full max-w-[420px] text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">{titulo}</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-bruma-400">{texto}</p>
        {acao ? (
          <Link
            href={acao.href}
            className="mt-5 inline-block rounded-lg bg-produto-700 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-produto-800"
          >
            {acao.rotulo}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
