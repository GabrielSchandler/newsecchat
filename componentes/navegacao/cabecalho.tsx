'use client';
import { usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import { MENU } from '@/lib/menu';
import { iniciais } from '@/lib/utilitarios';
export function CabecalhoAplicacao({ nome, papel }: { nome: string; papel: string }) {
  const caminho = usePathname();
  const titulo = MENU.find(i => caminho === i.caminho || caminho.startsWith(i.caminho + '/'))?.rotulo || (caminho.startsWith('/ia') ? 'Assistente IA' : 'NewSec Chat');
  return <header className="cabecalho-aplicacao"><div className="flex items-center gap-3"><Home size={15} className="hidden text-bruma-600 sm:block"/><span className="font-semibold">{titulo}</span></div><div className="flex items-center gap-2 border-l pl-4"><span className="avatar avatar-pequeno">{iniciais(nome)}</span><span className="hidden text-xs sm:block"><span className="text-bruma-600">{papel} · </span>{nome}</span></div></header>;
}
