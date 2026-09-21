import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dataLocal,localParaUTC } from '@/lib/operacao/calendario';
import { PainelRetornos } from './painel';
export const dynamic='force-dynamic';
export default async function Pagina({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const s=await exigirSessao(),p=await searchParams,db=await clienteServidor();const aba=p.aba||'vencidos',pagina=Math.max(1,Number(p.pagina)||1),todos=p.escopo==='equipe'&&s.papel!=='ATENDENTE';
 const hoje=dataLocal(new Date(),s.organizacao.fuso_horario).slice(0,10);const d=new Date(hoje+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);
 const inicio=localParaUTC(hoje+'T00:00',s.organizacao.fuso_horario),fim=localParaUTC(d.toISOString().slice(0,10)+'T00:00',s.organizacao.fuso_horario),agora=new Date().toISOString();
 function base(){let q=db.from('retornos').select('*',{count:'exact'}).eq('organizacao_id',s.organizacao.id).eq('estado','PENDENTE');if(!todos)q=q.eq('responsavel_id',s.membro.id);if(p.conversa)q=q.eq('conversa_id',p.conversa);return q;}
 let q=base();if(aba==='vencidos')q=q.lt('prazo',agora);else if(aba==='hoje')q=q.gte('prazo',inicio).lt('prazo',fim);else if(aba==='proximos')q=q.gte('prazo',fim);
 let sq=db.from('fila_operacional').select('*',{count:'exact'}).eq('organizacao_id',s.organizacao.id).eq('sugestao_retorno',true);if(!todos)sq=sq.eq('responsavel_id',s.membro.id);
 const [retornos,sugestoes,vencidos,dia,proximos]=await Promise.all([q.order('prazo').order('id').range((pagina-1)*40,pagina*40-1),sq.order('ultimo_publico_em').range(0,39),base().lt('prazo',agora).limit(0),base().gte('prazo',inicio).lt('prazo',fim).limit(0),base().gte('prazo',fim).limit(0)]);
 if([retornos,sugestoes,vencidos,dia,proximos].some(r=>r.error))throw new Error('Não foi possível carregar os retornos.');
 const ids=[...new Set((retornos.data||[]).map(r=>r.conversa_id))];const conversas=ids.length?await db.from('fila_operacional').select('*').in('id',ids):{data:[],error:null};if(conversas.error)throw new Error('Não foi possível carregar as conversas dos retornos.');
 return <PainelRetornos retornos={retornos.data||[]} conversas={conversas.data||[]} sugestoes={sugestoes.data||[]} contagens={{vencidos:vencidos.count||0,hoje:dia.count||0,proximos:proximos.count||0,sugestoes:sugestoes.count||0}} aba={aba} membroId={s.membro.id} fuso={s.organizacao.fuso_horario} podeEquipe={s.papel!=='ATENDENTE'} total={retornos.count||0} pagina={pagina}/>;
}
