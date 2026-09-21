import type { Metadata } from 'next';
import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { carregarApoio,carregarDetalheConversa } from './dados';
import { carregarFila,carregarRespostas,lerFiltros } from '@/lib/operacao/dados';
import { ListaOperacional } from './lista-operacional';
import { PainelConversa } from './conversa';
import { ContextoContato } from './contexto';
import { SincronizadorLista } from './sincronizador';
import { MessageSquare } from 'lucide-react';
export const metadata:Metadata={title:'Atendimento'};
export const dynamic='force-dynamic';
export default async function Atendimento({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const s=await exigirSessao();const p=await searchParams;const filtros=lerFiltros(p);
 const id=Array.isArray(p.conversa)?p.conversa[0]:p.conversa;
 const propria=p.escopo!=='equipe';if(propria)filtros.responsavel=s.membro.id;
 const db=await clienteServidor();
 const [fila,apoio,detalhe,respostas,operacional]=await Promise.all([
   carregarFila(filtros),carregarApoio(s.organizacao.id),id?carregarDetalheConversa(s.organizacao.id,id):null,carregarRespostas(),
   id?db.from('fila_operacional').select('*').eq('id',id).eq('organizacao_id',s.organizacao.id).maybeSingle():null,
 ]);
 if(operacional?.error)throw new Error('Não foi possível carregar o contexto do atendimento.');
 return <div className="central-atendimento" data-aberta={!!detalhe}>
  <div className="lista-atendimento"><ListaOperacional itens={fila.itens} contagens={fila.contagens} total={fila.total} pagina={fila.pagina} apoio={apoio} propria={propria}/></div>
  <div className="conversa-atendimento">{detalhe?<PainelConversa key={detalhe.conversa.id} detalhe={detalhe} apoio={apoio} meuMembroId={s.membro.id} organizacaoId={s.organizacao.id} operacional={operacional?.data||null} respostas={respostas} fuso={s.organizacao.fuso_horario}/>:<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"><MessageSquare className="text-produto-700" size={32}/><h1 className="text-lg font-semibold">Seu próximo atendimento começa aqui</h1><p className="max-w-sm text-sm text-bruma-600">Selecione uma conversa para responder e organizar a próxima ação.</p><SincronizadorLista organizacaoId={s.organizacao.id}/></div>}</div>
  {detalhe&&<aside className="contexto-atendimento"><ContextoContato detalhe={detalhe} apoio={apoio} operacional={operacional?.data||null} membroId={s.membro.id} fuso={s.organizacao.fuso_horario}/></aside>}
 </div>;
}
