'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Sparkles, LogOut, MessageSquare, Megaphone, Menu, Plug, Settings, UserRound, UsersRound, X, Clock3, MessageSquareText, ChartNoAxesCombined, ChevronRight } from 'lucide-react';
import { cn, iniciais } from '@/lib/utilitarios';
import type { ItemMenu, NomeIcone } from '@/lib/menu';
import { sair } from '@/app/entrar/acoes';
const ICONES: Record<NomeIcone, typeof MessageSquare> = {
  conversas: MessageSquare, painel: ChartNoAxesCombined, contatos: UserRound, campanhas: Megaphone,
  ia: Sparkles, integracoes: Plug, configuracoes: Settings, retornos: Clock3, respostas: MessageSquareText, equipes: UsersRound, relatorios: BarChart3,
};
export interface PropriedadesBarraLateral { itens: ItemMenu[]; nomeAplicacao: string; nomeOrganizacao: string; nomeUsuario: string; papelUsuario: string }
export function BarraLateral(props: PropriedadesBarraLateral) {
  const [aberta, setAberta] = React.useState(false); const caminho = usePathname();
  React.useEffect(() => setAberta(false), [caminho]);
  function item(i: ItemMenu) {
    const Icone = ICONES[i.icone]; const ativo = caminho === i.caminho || !!i.prefixo && caminho.startsWith(i.caminho + '/');
    return <Link key={i.caminho} href={i.caminho} aria-current={ativo ? 'page' : undefined} className={cn('item-menu', ativo && 'item-menu-ativo')}><Icone size={18}/><span>{i.rotulo}</span></Link>;
  }
  return <>
    <button className="abrir-menu" onClick={() => setAberta(true)} aria-label="Abrir navegação"><Menu size={21}/></button>
    {aberta && <button className="cobertura-menu" onClick={() => setAberta(false)} aria-label="Fechar navegação"/>}
    <aside className={cn('barra-navegacao', aberta && 'navegacao-aberta')}>
      <div className="marca-aplicacao"><Link href="/atendimento" aria-label={props.nomeAplicacao}><strong>newsec</strong><span>CHAT</span></Link><button className="lg:hidden" aria-label="Fechar menu" onClick={() => setAberta(false)}><X size={19}/></button></div>
      <nav className="navegacao-principal" aria-label="Navegação principal">{props.itens.filter(i => !i.secundario && i.icone !== 'configuracoes').map(item)}
        {props.itens.some(i => i.secundario) && <details className="mt-5"><summary className="cursor-pointer px-3 py-2 text-xs text-slate-300">Mais ferramentas</summary>{props.itens.filter(i => i.secundario).map(item)}</details>}
      </nav>
      <div className="p-2">{props.itens.filter(i => i.icone === 'configuracoes').map(item)}</div>
      <details className="perfil-navegacao"><summary className="flex cursor-pointer items-center gap-2"><span className="avatar avatar-pequeno">{iniciais(props.nomeUsuario)}</span><span className="min-w-0 flex-1 truncate text-xs">{props.nomeUsuario}</span><ChevronRight size={13}/></summary><div className="pt-3 text-xs text-slate-300"><p>{props.papelUsuario} · {props.nomeOrganizacao}</p><form action={sair} onSubmit={()=>{try{Object.keys(sessionStorage).filter(k=>k.startsWith('newsec:rascunho:')).forEach(k=>sessionStorage.removeItem(k));}catch{}}}><button className="mt-3 flex items-center gap-2"><LogOut size={14}/>Sair da conta</button></form></div></details>
    </aside>
  </>;
}
