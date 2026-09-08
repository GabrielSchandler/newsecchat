'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utilitarios';

export interface ItemSubNavegacao {
  rotulo: string;
  caminho: string;
}

/**
 * Abas de segundo nível. Rola na horizontal no celular em vez de quebrar
 * em duas linhas — assim a posição das abas não muda conforme a largura.
 */
export function SubNavegacao({
  itens,
  className,
}: {
  itens: readonly ItemSubNavegacao[];
  className?: string;
}) {
  const caminho = usePathname();

  return (
    <nav
      className={cn('flex gap-1 overflow-x-auto rolagem-fina border-b border-bruma-200', className)}
      aria-label="Seções"
    >
      {itens.map((item) => {
        const ativo = caminho === item.caminho;
        return (
          <Link
            key={item.caminho}
            href={item.caminho}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors',
              ativo
                ? 'border-produto-700 text-produto-800'
                : 'border-transparent text-bruma-600 hover:border-bruma-300 hover:text-tinta-800',
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
