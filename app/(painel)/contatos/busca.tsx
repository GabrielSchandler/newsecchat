'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Selecao } from '@/componentes/ui/campo';
import type { Etiqueta } from '@/lib/tipos-banco';

export function BuscaContatos({
  buscaAtual,
  etiquetaAtual,
  etiquetas,
}: {
  buscaAtual: string;
  etiquetaAtual: string;
  etiquetas: Etiqueta[];
}) {
  const roteador = useRouter();
  const [busca, definirBusca] = React.useState(buscaAtual);

  const navegar = React.useCallback(
    (novaBusca: string, novaEtiqueta: string) => {
      const parametros = new URLSearchParams();
      if (novaBusca.trim()) parametros.set('busca', novaBusca.trim());
      if (novaEtiqueta) parametros.set('etiqueta', novaEtiqueta);
      const consulta = parametros.toString();
      roteador.replace(consulta ? `/contatos?${consulta}` : '/contatos');
    },
    [roteador],
  );

  // Só consulta o servidor depois que o usuário para de digitar.
  React.useEffect(() => {
    if (busca === buscaAtual) return;
    const relogio = setTimeout(() => navegar(busca, etiquetaAtual), 350);
    return () => clearTimeout(relogio);
  }, [busca, buscaAtual, etiquetaAtual, navegar]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bruma-500"
          aria-hidden
        />
        <input
          type="search"
          value={busca}
          onChange={(evento) => definirBusca(evento.target.value)}
          placeholder="Buscar por nome ou telefone"
          aria-label="Buscar contatos"
          className="h-9 w-full rounded-lg border border-bruma-300 bg-white pl-8 pr-3 text-[13.5px] text-tinta-900 placeholder:text-bruma-500 focus:border-produto-700"
        />
      </div>

      {etiquetas.length ? (
        <Selecao
          value={etiquetaAtual}
          aria-label="Filtrar por etiqueta"
          onChange={(evento) => navegar(busca, evento.target.value)}
          className="w-auto min-w-[180px]"
        >
          <option value="">Todas as etiquetas</option>
          {etiquetas.map((etiqueta) => (
            <option key={etiqueta.id} value={etiqueta.id}>
              {etiqueta.nome}
            </option>
          ))}
        </Selecao>
      ) : null}
    </div>
  );
}
