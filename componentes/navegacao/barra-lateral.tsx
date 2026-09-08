'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bot,
  LogOut,
  MessageSquareText,
  Megaphone,
  Menu,
  Plug,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { cn, iniciais } from '@/lib/utilitarios';
import type { ItemMenu, NomeIcone } from '@/lib/menu';
import { sair } from '@/app/entrar/acoes';

const ICONES: Record<NomeIcone, React.ComponentType<{ className?: string }>> = {
  conversas: MessageSquareText,
  painel: BarChart3,
  contatos: Users,
  campanhas: Megaphone,
  ia: Bot,
  integracoes: Plug,
  configuracoes: Settings,
};

export interface PropriedadesBarraLateral {
  itens: ItemMenu[];
  nomeAplicacao: string;
  nomeOrganizacao: string;
  nomeUsuario: string;
  papelUsuario: string;
}

export function BarraLateral(propriedades: PropriedadesBarraLateral) {
  const [abertaNoCelular, definirAberta] = React.useState(false);
  const caminho = usePathname();

  // Navegou: fecha o menu do celular. Sem isso, o painel fica por cima do
  // conteúdo que o usuário acabou de abrir.
  React.useEffect(() => {
    definirAberta(false);
  }, [caminho]);

  return (
    <>
      <button
        type="button"
        onClick={() => definirAberta(true)}
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-bruma-300 bg-white text-tinta-800 shadow-sm lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      {abertaNoCelular ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-tinta-950/50 lg:hidden"
          onClick={() => definirAberta(false)}
          aria-label="Fechar menu"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col bg-tinta-950 transition-transform lg:static lg:translate-x-0',
          abertaNoCelular ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/atendimento" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marca-500">
              <MessageSquareText className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="truncate text-[14.5px] font-semibold tracking-tight text-white">
              {propriedades.nomeAplicacao}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => definirAberta(false)}
            className="rounded-lg p-1 text-bruma-500 hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto rolagem-fina px-2.5 py-2">
          {propriedades.itens.map((item) => {
            const Icone = ICONES[item.icone];
            const ativo = item.prefixo
              ? caminho === item.caminho || caminho.startsWith(`${item.caminho}/`)
              : caminho === item.caminho;

            return (
              <Link
                key={item.caminho}
                href={item.caminho}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                  ativo
                    ? 'bg-tinta-800 text-white'
                    : 'text-bruma-400 hover:bg-tinta-900 hover:text-bruma-200',
                )}
              >
                <Icone className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.rotulo}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-tinta-800 p-2.5">
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tinta-800 text-[11px] font-semibold text-bruma-200">
              {iniciais(propriedades.nomeUsuario)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-bruma-200">
                {propriedades.nomeUsuario}
              </span>
              <span className="block truncate text-[11px] text-bruma-600">
                {propriedades.papelUsuario} · {propriedades.nomeOrganizacao}
              </span>
            </span>
          </div>

          <form action={sair}>
            <button
              type="submit"
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-bruma-500 transition-colors hover:bg-tinta-900 hover:text-bruma-200"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
