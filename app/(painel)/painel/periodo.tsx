'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utilitarios';

const OPCOES = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7dias', rotulo: '7 dias' },
  { chave: '30dias', rotulo: '30 dias' },
] as const;

export function PeriodoPainel({ atual }: { atual: string }) {
  const caminho = usePathname();

  return (
    <div className="inline-flex rounded-lg border border-bruma-300 bg-white p-0.5" role="group">
      {OPCOES.map((opcao) => (
        <Link
          key={opcao.chave}
          href={`${caminho}?periodo=${opcao.chave}`}
          aria-current={atual === opcao.chave ? 'true' : undefined}
          className={cn(
            'rounded px-2.5 py-1 text-[13px] font-medium transition-colors',
            atual === opcao.chave
              ? 'bg-tinta-900 text-white'
              : 'text-bruma-600 hover:bg-bruma-100 hover:text-tinta-800',
          )}
        >
          {opcao.rotulo}
        </Link>
      ))}
    </div>
  );
}
