import { exigirPapel } from '@/lib/sessao';
import { MENU_CONFIGURACOES } from '@/lib/menu';
import { SubNavegacao } from '@/componentes/navegacao/sub-navegacao';

export default async function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  // Um único ponto de verificação para toda a área de configuração.
  // Cada ação confere de novo por conta própria: esta é a porta, não a
  // fechadura.
  await exigirPapel('ADMIN');

  return (
    <div className="pagina-operacional">
      <SubNavegacao itens={MENU_CONFIGURACOES} className="mb-4" />

      <div className="mt-4">{children}</div>
    </div>
  );
}
