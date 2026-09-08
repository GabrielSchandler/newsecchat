import { exigirPapel } from '@/lib/sessao';
import { MENU_IA } from '@/lib/menu';
import { SubNavegacao } from '@/componentes/navegacao/sub-navegacao';

export default async function LayoutIa({ children }: { children: React.ReactNode }) {
  await exigirPapel('SUPERVISOR');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-tinta-950">Inteligência artificial</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-bruma-600">
        O que a IA sabe, como ela conversa e o que ela aprendeu com os atendimentos. Nada aqui entra em
        produção sem alguém publicar.
      </p>

      <SubNavegacao itens={MENU_IA} className="mt-5" />

      <div className="mt-6">{children}</div>
    </div>
  );
}
