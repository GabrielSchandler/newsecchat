'use server';
import { z } from 'zod';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { revalidatePath } from 'next/cache';
export async function salvarAcesso(entrada:unknown){
 const p=z.object({membro:z.string().uuid(),papel:z.enum(['ATENDENTE','SUPERVISOR','ADMIN','SUPER_ADMIN']),equipes:z.array(z.string().uuid()).max(50),escopo:z.enum(['PROPRIAS','EQUIPE']),assumir:z.boolean(),transferir:z.boolean()}).safeParse(entrada);
 if(!p.success)return {ok:false,erro:'Confira os dados de acesso.'};
 await exigirPapel('ADMIN');const db=await clienteServidor();const v=p.data;
 const {error}=await db.rpc('salvar_acesso_operacional',{p_membro:v.membro,p_papel:v.papel,p_equipes:v.equipes,p_escopo:v.escopo,p_assumir:v.assumir,p_transferir:v.transferir});
 if(error)return {ok:false,erro:error.message};revalidatePath('/configuracoes/usuarios');return {ok:true};
}
