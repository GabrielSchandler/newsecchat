import { exigirPapel } from '@/lib/sessao';
import { MENU_CONFIGURACOES } from '@/lib/menu';
import { SubNavegacao } from '@/componentes/navegacao/sub-navegacao';

export default async function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  // Um único ponto de verificação para toda a área de configuração.
  // Cada ação confere de novo por conta própria: esta é a porta, não a
  // fechadura.
  await exigirPapel('ADMIN');

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-tinta-950">Configurações</h1>
      <p className="mt-1 text-[13.5px] text-bruma-600">
        Canais, pessoas, departamentos e o que a IA precisa coletar.
      </p>

      <SubNavegacao itens={MENU_CONFIGURACOES} className="mt-5" />

      <div className="mt-6">{children}</div>
    </div>
  );
}
