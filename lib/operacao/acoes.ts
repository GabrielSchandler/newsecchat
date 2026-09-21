'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { exigirPapel, exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { localParaUTC } from './calendario';
import { normalizarTelefone } from '@/lib/nucleo/telefone';
const uuid = z.string().uuid();
export async function criarContatoOperacional(entrada:unknown){
 const p=z.object({nome:z.string().trim().min(1).max(120),telefone:z.string(),email:z.string().email().or(z.literal(''))}).safeParse(entrada);if(!p.success)return {ok:false,erro:'Confira nome, telefone e e-mail.'};
 const telefone=normalizarTelefone(p.data.telefone);if(!telefone)return {ok:false,erro:'Telefone inválido. Inclua DDD e país.'};
 const s=await exigirSessao(),db=await clienteServidor();const {data,error}=await db.from('contatos').insert({organizacao_id:s.organizacao.id,nome:p.data.nome,telefone,email:p.data.email||null,responsavel_id:s.membro.id,origem:'MANUAL'}).select('id').single();
 if(error)return {ok:false,erro:error.code==='23505'?'Este telefone já está cadastrado. Busque o contato existente.':'Não foi possível criar o contato.'};
 revalidatePath('/contatos');return {ok:true,id:data.id};
}
export async function buscarConversas(termo: string) {
 const s=await exigirSessao(); const db=await clienteServidor();
 const busca=termo.slice(0,100).replace(/[,%()"\\]/g,'');
 let q=db.from('fila_operacional').select('id,contato_nome,contato_telefone,canal_nome,responsavel_id').eq('organizacao_id',s.organizacao.id).neq('estado','ENCERRADA');
 if(busca)q=q.or('contato_nome.ilike.%'+busca+'%,contato_telefone.ilike.%'+busca+'%');
 const {data,error}=await q.order('ultima_mensagem_em',{ascending:false}).limit(20);
 if(error)throw new Error('Não foi possível buscar atendimentos.');return data||[];
}
const retornoSchema = z.object({ id: uuid, conversaId: uuid, responsavelId: uuid, motivo: z.string().trim().min(1).max(500), prazo: z.string(), permitirPassado: z.boolean().default(false), versao: z.number().int().positive().optional() });
function atualizar() { for (const p of ['/atendimento','/retornos','/supervisao','/equipes','/contatos','/relatorios']) revalidatePath(p); }
export async function salvarRetorno(entrada: unknown) {
  const parsed = retornoSchema.safeParse(entrada); if (!parsed.success) return { ok: false, erro: 'Preencha contato, responsável, prazo e motivo.' };
  const v = parsed.data; const s = await exigirSessao(); const db = await clienteServidor();
  let prazo: string;
  try { prazo = localParaUTC(v.prazo, s.organizacao.fuso_horario); } catch (e) { return { ok: false, erro: e instanceof Error ? e.message : 'Prazo inválido.' }; }
  if (Date.parse(prazo) < Date.now() && !v.permitirPassado) return { ok: false, erro: 'O prazo está no passado. Confirme explicitamente o cadastro vencido.' };
  const { data: conversa } = await db.from('conversas').select('id,departamento_id,estado').eq('id', v.conversaId).eq('organizacao_id', s.organizacao.id).maybeSingle();
  if (!conversa || conversa.estado === 'ENCERRADA') return { ok: false, erro: 'Escolha um atendimento aberto ao qual você tem acesso.' };
  const { data: membro } = await db.from('membros_organizacao').select('id').eq('id', v.responsavelId).eq('organizacao_id', s.organizacao.id).eq('ativo', true).maybeSingle();
  if (!membro || (s.papel === 'ATENDENTE' && membro.id !== s.membro.id)) return { ok: false, erro: 'Responsável não autorizado.' };
  const dados = { responsavel_id: v.responsavelId, motivo: v.motivo, prazo };
  if (v.versao) {
    const { data, error } = await db.from('retornos').update(dados).eq('id', v.id).eq('conversa_id', v.conversaId).eq('organizacao_id', s.organizacao.id).eq('versao', v.versao).eq('estado','PENDENTE').select('id');
    if (error || !data?.length) return { ok: false, erro: 'O retorno mudou ou você não pode editá-lo. Atualize antes de salvar.' };
  } else {
    const { error } = await db.from('retornos').insert({ ...dados, id: v.id, conversa_id: v.conversaId, organizacao_id: s.organizacao.id, criado_por: s.membro.id });
    if (error) {
      if(error.code!=='23505')return {ok:false,erro:'Não foi possível agendar o retorno. Confira se o responsável tem acesso ao atendimento.'};
      const {data:existente}=await db.from('retornos').select('*').eq('id',v.id).eq('organizacao_id',s.organizacao.id).maybeSingle();
      if(!existente || existente.conversa_id!==v.conversaId || existente.responsavel_id!==v.responsavelId || existente.motivo!==v.motivo || Date.parse(existente.prazo)!==Date.parse(prazo))return {ok:false,erro:'Este retorno já mudou. Atualize a lista antes de salvar.'};
    }
  }
  atualizar(); return { ok: true };
}
export async function finalizarRetorno(id: string, versao: number, estado: 'CONCLUIDO' | 'CANCELADO') {
  if (!uuid.safeParse(id).success || !['CONCLUIDO','CANCELADO'].includes(estado)) return { ok:false, erro:'Retorno inválido.' };
  const s = await exigirSessao(); const db = await clienteServidor();
  const { data, error } = await db.from('retornos').update({ estado }).eq('id',id).eq('organizacao_id',s.organizacao.id).eq('versao',versao).eq('estado','PENDENTE').select('id');
  if (error || !data?.length) return { ok:false, erro:'Retorno alterado ou sem permissão. Atualize a lista.' };
  atualizar(); return { ok:true };
}
const respostaSchema = z.object({ id: uuid, nome:z.string().trim().min(1).max(100), atalho:z.string().regex(/^\/[a-z0-9_-]{1,30}$/), categoria:z.string().trim().min(1).max(80), conteudo:z.string().trim().min(1).max(4000), compartilhada:z.boolean(), departamento_id:uuid.nullable() });
export async function salvarResposta(entrada: unknown) {
  const parsed = respostaSchema.safeParse(entrada); if (!parsed.success) return {ok:false,erro:'Preencha os campos. O atalho deve começar com / e usar letras minúsculas, números, - ou _.'};
  const s=await exigirSessao();const db=await clienteServidor(); const v=parsed.data;
  if(v.compartilhada && s.papel==='ATENDENTE') return {ok:false,erro:'Apenas supervisores podem editar respostas compartilhadas.'};
  const {data: existente}=await db.from('respostas_rapidas').select('id').eq('id',v.id).maybeSingle();
  const dados={...v,organizacao_id:s.organizacao.id,autor_id:s.membro.id,atualizado_em:new Date().toISOString()};
  const resultado=existente ? await db.from('respostas_rapidas').update(dados).eq('id',v.id).eq('organizacao_id',s.organizacao.id).select('id') : await db.from('respostas_rapidas').insert(dados).select('id');
  if(resultado.error || !resultado.data?.length) return {ok:false,erro:resultado.error?.code==='23505'?'Esse atalho já existe nesse escopo.':'Não foi possível salvar. Confira sua permissão.'};
  revalidatePath('/respostas-rapidas');revalidatePath('/atendimento');return {ok:true};
}
const regraSchema=z.object({ fuso:z.string().min(1),dias:z.array(z.number().int().min(1).max(7)).min(1),intervalos:z.array(z.object({inicio:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),fim:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)})).min(1).max(4),feriados:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),meta_minutos:z.number().int().min(1).max(1440),alerta_minutos:z.number().int().min(0),retorno_dias:z.number().int().min(1).max(90),reabrir:z.boolean(),versao:z.number().int().min(0) });
export async function salvarRegra(entrada:unknown) {
  const parsed=regraSchema.safeParse(entrada);if(!parsed.success)return {ok:false,erro:'Confira horários, dias e prazos.'};
  const v=parsed.data; if(v.alerta_minutos>=v.meta_minutos)return {ok:false,erro:'O aviso preventivo precisa ocorrer antes da meta.'};
  try{new Intl.DateTimeFormat('pt-BR',{timeZone:v.fuso}).format(new Date());}catch{return {ok:false,erro:'Fuso horário inválido.'};}
  const minutos=(h:string)=>Number(h.slice(0,2))*60+Number(h.slice(3));
  const ocupados=new Set<number>();
  for(const intervalo of v.intervalos){const inicio=minutos(intervalo.inicio),fim=minutos(intervalo.fim);if(inicio===fim)return {ok:false,erro:'Início e fim não podem ser iguais.'};for(let n=inicio;n<(fim>inicio?fim:fim+1440);n++){if(ocupados.has(n%1440))return {ok:false,erro:'Os intervalos não podem se sobrepor.'};ocupados.add(n%1440);}}
  const s=await exigirPapel('ADMIN');const db=await clienteServidor();
  const {error}=await db.from('regras_atendimento').insert({...v,versao:v.versao+1,organizacao_id:s.organizacao.id,criado_por:s.membro.id,intervalos:v.intervalos});
  if(error)return {ok:false,erro:error.code==='23505'?'Outra pessoa atualizou as regras. Recarregue antes de salvar.':'Não foi possível salvar as regras.'};

  revalidatePath('/configuracoes/atendimento');atualizar();return {ok:true};
}
