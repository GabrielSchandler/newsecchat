'use client';
import { useRouter,useSearchParams,usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import type { ApoioAtendimento } from '@/app/(painel)/atendimento/tipos';
export function FiltrosEquipe({apoio,atualizado,canais=[]}:{apoio:ApoioAtendimento;atualizado?:string;canais?:{id:string;nome:string}[]}){
 const router=useRouter(),params=useSearchParams(),path=usePathname();
 function mudar(chave:string,v:string){const q=new URLSearchParams(params.toString());v?q.set(chave,v):q.delete(chave);q.delete('pagina');router.push(`${path}?${q}`,{scroll:false});}
 return <div className="flex flex-wrap items-center gap-2"><button className="flex min-h-9 items-center gap-2 px-2 text-xs text-bruma-600" onClick={()=>router.refresh()} title="Atualizar filas"><RefreshCw size={14}/>{atualizado?`Atualizado ${atualizado}`:'Atualizar'}</button><select aria-label="Equipe" className="campo-operacional !w-auto" value={params.get('equipe')||''} onChange={e=>mudar('equipe',e.target.value)}><option value="">Todas as equipes</option>{apoio.departamentos.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select><select aria-label="Consultor" className="campo-operacional !w-auto" value={params.get('responsavel')||''} onChange={e=>mudar('responsavel',e.target.value)}><option value="">Todos os consultores</option>{apoio.atendentes.map(a=><option key={a.membroId} value={a.membroId}>{a.nome}</option>)}</select>{canais.length>0&&<select aria-label="Canal" className="campo-operacional !w-auto" value={params.get("canal")||""} onChange={e=>mudar("canal",e.target.value)}><option value="">Todos os canais</option>{canais.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>}</div>;
}
