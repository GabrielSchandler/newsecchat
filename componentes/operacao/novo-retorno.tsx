'use client';
import { useState } from 'react';
import { Plus,Search } from 'lucide-react';
import { Dialogo,ConteudoDialogo,CorpoDialogo } from '@/componentes/ui/dialogo';
import { buscarConversas } from '@/lib/operacao/acoes';
import { AgendarRetorno } from './agendar-retorno';
export function NovoRetorno({membroId,fuso}:{membroId:string;fuso:string}){
 const [aberto,setAberto]=useState(false),[lista,setLista]=useState<Awaited<ReturnType<typeof buscarConversas>>>([]),[erro,setErro]=useState('');
 async function buscar(termo=''){try{setErro('');setLista(await buscarConversas(termo));}catch{setErro('Não foi possível carregar os atendimentos. Tente novamente.');}}
 return <><button className="botao-primario" onClick={()=>{setAberto(true);void buscar();}}><Plus size={17}/>Agendar retorno</button><Dialogo open={aberto} onOpenChange={setAberto}><ConteudoDialogo titulo="Escolha o atendimento" descricao="O retorno ficará vinculado à conversa selecionada."><CorpoDialogo><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void buscar(String(new FormData(e.currentTarget).get('busca')||''));}}><input name="busca" aria-label="Buscar contato" className="campo-operacional" placeholder="Buscar por nome"/><button className="botao-link" aria-label="Buscar"><Search size={17}/></button></form>{erro&&<p role="alert" className="text-sm text-marca-600">{erro}</p>}<ul className="divide-y">{lista.map(i=><li key={i.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><strong className="block text-sm">{i.contato_nome}</strong><p className="text-xs text-bruma-600">{i.contato_telefone} · {i.canal_nome}</p></div><div><AgendarRetorno conversaId={i.id} nome={i.contato_nome} membroId={membroId} fuso={fuso}/></div></li>)}</ul>{!lista.length&&!erro&&<p className="text-sm text-bruma-600">Nenhum atendimento aberto encontrado.</p>}</CorpoDialogo></ConteudoDialogo></Dialogo></>;
}
