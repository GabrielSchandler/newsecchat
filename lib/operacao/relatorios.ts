import 'server-only';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dataLocal,localParaUTC } from './calendario';
export type Relatorio={iniciadas:number;concluidas:number;elegiveis:number;excluidas:number;dentro_meta:number;mediana:number|null;cobertura:string|null;esperas_abertas:number;esperas_vencidas:number;equipes:{equipe_id:string|null;nome:string|null;elegiveis:number;dentro_meta:number;mediana:number|null}[]};
export async function obterRelatorio(p:Record<string,string|undefined>){
 const s=await exigirPapel('SUPERVISOR');const db=await clienteServidor();const hoje=dataLocal(new Date(),s.organizacao.fuso_horario).slice(0,10);
 const inicio=p.inicio||hoje,final=p.fim||hoje;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(final)||inicio>final)throw new Error('Período inválido.');
 if(Date.parse(final)-Date.parse(inicio)>366*86400000)throw new Error('Selecione até 366 dias por relatório.');
 const d=new Date(final+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);
 const fim=localParaUTC(d.toISOString().slice(0,10)+'T00:00',s.organizacao.fuso_horario);
 const {data,error}=await db.rpc('relatorio_atendimento',{p_inicio:localParaUTC(inicio+'T00:00',s.organizacao.fuso_horario),p_fim:fim,p_equipe:p.equipe||null,p_canal:p.canal||null});
 if(error)throw new Error('Não foi possível carregar os relatórios.');
 return {dados:data as unknown as Relatorio,inicio,final,fuso:s.organizacao.fuso_horario};
}
