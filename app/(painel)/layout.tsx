import { exigirSessao, rotuloPapel } from '@/lib/sessao';
import { menuVisivel } from '@/lib/menu';
import { ambientePublico } from '@/lib/ambiente';
import { BarraLateral } from '@/componentes/navegacao/barra-lateral';

/**
 * Estrutura das telas internas: barra lateral fixa e a área de trabalho.
 *
 * A sessão é exigida aqui, uma vez, e o resultado vale para toda a
 * subárvore — `sessaoAtual` é memorizada por renderização, então as
 * páginas filhas podem chamá-la de novo sem custo de consulta.
 */
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao();

  return (
    <div className="flex min-h-screen">
      <BarraLateral
        itens={menuVisivel(sessao.papel)}
        nomeAplicacao={ambientePublico.nomeAplicacao}
        nomeOrganizacao={sessao.organizacao.nome}
        nomeUsuario={sessao.perfil.nome || sessao.perfil.email}
        papelUsuario={rotuloPapel[sessao.papel]}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
