import Link from 'next/link';
import { ArrowRight, Clock3, MessageSquare, UserRound, TriangleAlert, Sparkles } from 'lucide-react';
import { cn, iniciais, formatarEspera } from '@/lib/utilitarios';
import { Selo } from '@/componentes/ui/estrutura';
import { situacao, type FilaOperacional } from '@/lib/operacao/tipos';
export function Identidade({ nome, telefone, pequeno=false }: { nome:string; telefone?:string; pequeno?:boolean }) {
  return <span className="flex min-w-0 items-center gap-2.5"><span className={cn('avatar',pequeno&&'avatar-pequeno')}>{iniciais(nome)}</span><span className="min-w-0"><span className="block truncate font-semibold text-tinta-950">{nome}</span>{telefone&&<span className="mt-0.5 block text-[11px] font-normal text-bruma-600">{telefone}</span>}</span></span>;
}
export function Situacao({item}:{item:FilaOperacional}){const s=situacao(item);return <Selo tom={s.tom}>{s.texto}</Selo>;}
export function Metricas({contagens,filtros={}}:{contagens:Record<string,number>;filtros?:{equipe?:string;canal?:string;responsavel?:string}}) {
  const items=[['sem-responsavel','Sem responsável',UserRound,'bg-bruma-100 text-tinta-800'],['responder','Clientes aguardando',Clock3,'bg-alerta-100 text-alerta-700'],['vencidos','Retornos vencidos',TriangleAlert,'bg-marca-50 text-marca-600'],['ia','Com IA',Sparkles,'bg-ia-50 text-ia-600']] as const;
  const query=new URLSearchParams();for(const k of ['equipe','canal','responsavel'] as const){const v=filtros[k];if(v)query.set(k,v);}query.set('escopo','equipe');
  return <div className="metricas-operacionais">{items.map(([chave,rotulo,Icone,cor])=><Link key={chave} href={'/atendimento?'+query+'&caixa='+chave} className="metrica group"><span className={cn('metrica-icone',cor)}><Icone size={23}/></span><div><p className="text-[12px] text-bruma-600">{rotulo}</p><p className="text-[25px] font-semibold leading-tight tabular-nums">{contagens[chave]||0}</p></div><ArrowRight size={14} className="ml-auto text-produto-700 opacity-0 group-hover:opacity-100"/></Link>)}</div>;
}
export function FilaTabela({itens,acao='Abrir',destino}:{itens:FilaOperacional[];acao?:string;destino?:(id:string)=>string}) {
  return <div className="tabela-container" role="region" aria-label="Fila de atendimentos" tabIndex={0}><table className="tabela-operacional"><thead><tr><th>Contato</th><th>Equipe</th><th>Responsável</th><th>Situação</th><th>Espera</th><th>Ação</th></tr></thead><tbody>{itens.map(i=><tr key={i.id}><td><Identidade nome={i.contato_nome} pequeno/></td><td>{i.equipe_nome||'Sem equipe'}</td><td>{i.responsavel_nome||'Sem responsável'}</td><td><Situacao item={i}/></td><td className={i.resposta_vencida?'font-semibold text-marca-600':''}>{i.espera_desde?formatarEspera(i.espera_desde):'—'}</td><td><Link className="botao-link" href={destino?destino(i.id):`/atendimento?conversa=${i.id}`}>{acao}<MessageSquare size={13}/></Link></td></tr>)}</tbody></table>{!itens.length&&<p className="px-4 py-10 text-center text-sm text-bruma-600">Nenhuma conversa para estes filtros.</p>}</div>;
}
