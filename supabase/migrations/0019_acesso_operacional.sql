-- Escopo operacional e ações: aplicado no banco, inclusive buscas e exportações.
alter table membros_organizacao add column escopo_conversas text not null default 'EQUIPE' check(escopo_conversas in('PROPRIAS','EQUIPE'));
alter table membros_organizacao add column pode_assumir boolean not null default true;
alter table membros_organizacao add column pode_transferir boolean not null default true;
create or replace function pode_ver_conversa(alvo uuid,departamento uuid,responsavel uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from membros_organizacao m where m.organizacao_id=alvo and m.perfil_id=auth.uid() and m.ativo and(
 m.papel in('ADMIN','SUPER_ADMIN') or responsavel=m.id or
 (m.escopo_conversas='EQUIPE' and(departamento in(select meus_departamentos(alvo)) or departamento is null and m.pode_assumir))
 ));
$$;
create function contato_visivel(p_contato uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from contatos ct where ct.id=p_contato and(
 pode_ver_conversa(ct.organizacao_id,ct.departamento_id,ct.responsavel_id) or exists(select 1 from conversas c where c.contato_id=ct.id and pode_ver_conversa(c.organizacao_id,c.departamento_id,c.responsavel_id))));
$$;
-- Políticas antigas são substituídas, pois policies permissivas se somam por OR.
do $$ declare t text;p record;cond text;
begin
 foreach t in array array['notas_internas','etiquetas_conversa','eventos_conversa','arquivos','contatos','etiquetas_contato','memorias_contato','valores_campos_contato'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on %I',p.policyname,t);end loop;
  cond:=case when t in('notas_internas','etiquetas_conversa','eventos_conversa') then 'conversa_visivel(conversa_id)' when t='contatos' then 'pode_ver_conversa(organizacao_id,departamento_id,responsavel_id) or exists(select 1 from conversas c where c.contato_id=contatos.id)' else 'contato_visivel(contato_id)' end;
  execute format('create policy operacao_ler on %I for select using(%s)',t,cond);
  if t<>'eventos_conversa' then
   execute format('create policy operacao_criar on %I for insert with check(pertence_organizacao(organizacao_id) and (%s))',t,case when t='contatos' then 'responsavel_id=meu_membro_id(organizacao_id) or eh_supervisor_ou_acima(organizacao_id)' else cond end);
   execute format('create policy operacao_editar on %I for update using(%s) with check(pertence_organizacao(organizacao_id) and (%s))',t,cond,cond);
   execute format('create policy operacao_remover on %I for delete using(%s)',t,cond);
  end if;
 end loop;
end $$;
-- Atualizações de estado só podem passar pelas operações validadas.
revoke update on conversas from authenticated;
grant update(nao_lidas,ultima_mensagem_em,ultima_mensagem_previa) on conversas to authenticated;
revoke update,delete on mensagens from authenticated;
drop policy "mensagens: membro cria na organização" on mensagens;
create policy mensagens_criar_operacional on mensagens for insert with check(
 autor='ATENDENTE' and direcao='SAIDA' and status='PENDENTE' and autor_membro_id=meu_membro_id(organizacao_id)
 and exists(select 1 from conversas c where c.id=conversa_id and c.organizacao_id=mensagens.organizacao_id and c.contato_id=mensagens.contato_id and c.canal_id=mensagens.canal_id and c.estado='HUMANO' and c.responsavel_id=autor_membro_id));

create function autorizar_operacao(p_conversa uuid,p_ator uuid,p_acao text) returns conversas language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;m membros_organizacao%rowtype;
begin
 select * into c from conversas where id=p_conversa for update;
 if not found then raise exception 'Conversa não encontrada';end if;
 if auth.uid() is null and auth.role() in('service_role','postgres') then return c;end if;
 select * into m from membros_organizacao where id=p_ator and perfil_id=auth.uid() and ativo and organizacao_id=c.organizacao_id;
 if not found or not pode_ver_conversa(c.organizacao_id,c.departamento_id,c.responsavel_id) then raise exception 'Acesso não autorizado';end if;
 if p_acao='ASSUMIR' and c.responsavel_id is null and not m.pode_assumir and m.papel not in('ADMIN','SUPER_ADMIN') then raise exception 'Sem permissão para assumir';end if;
 if p_acao='TRANSFERIR' and not m.pode_transferir and m.papel not in('ADMIN','SUPER_ADMIN') then raise exception 'Sem permissão para transferir';end if;
 if p_acao in('DEVOLVER','ENCERRAR') and m.papel='ATENDENTE' and c.responsavel_id is distinct from m.id then raise exception 'Assuma o atendimento antes desta ação';end if;
 return c;
end $$;
revoke all on function autorizar_operacao(uuid,uuid,text) from public,anon,authenticated;

alter function assumir_conversa(uuid,uuid,text) rename to operacao_assumir_interno;
alter function transferir_conversa(uuid,uuid,uuid,uuid,autor_mensagem,text) rename to operacao_transferir_interno;
alter function devolver_conversa_para_ia(uuid,uuid,text) rename to operacao_devolver_interno;
alter function encerrar_conversa(uuid,uuid,text) rename to operacao_encerrar_interno;
alter function reabrir_conversa(uuid,uuid,boolean) rename to operacao_reabrir_interno;
revoke all on function operacao_assumir_interno(uuid,uuid,text),operacao_transferir_interno(uuid,uuid,uuid,uuid,autor_mensagem,text),operacao_devolver_interno(uuid,uuid,text),operacao_encerrar_interno(uuid,uuid,text),operacao_reabrir_interno(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function assumir_conversa(p_conversa_id uuid,p_membro_id uuid,p_motivo text default null) returns boolean language plpgsql security definer set search_path=public as $$
begin perform autorizar_operacao(p_conversa_id,p_membro_id,'ASSUMIR');return operacao_assumir_interno(p_conversa_id,p_membro_id,p_motivo);end $$;
create function transferir_conversa(p_conversa_id uuid,p_departamento_id uuid,p_membro_id uuid,p_ator_membro_id uuid,p_ator autor_mensagem default 'ATENDENTE',p_motivo text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;dest uuid;
begin
 c:=autorizar_operacao(p_conversa_id,p_ator_membro_id,'TRANSFERIR');
 if p_ator='IA' then
  if auth.uid() is not null then raise exception 'Ator inválido';end if;
  if c.estado not in('IA','AGUARDANDO_CLIENTE') then return false;end if;
 elsif p_ator<>'ATENDENTE' and auth.uid() is not null then raise exception 'Ator inválido';end if;
 dest:=coalesce(p_departamento_id,c.departamento_id);
 if dest is not null and not exists(select 1 from departamentos where id=dest and organizacao_id=c.organizacao_id and ativo) then raise exception 'Equipe inválida';end if;
 if auth.uid() is not null and not eh_gestor(c.organizacao_id) and dest is distinct from c.departamento_id and not exists(select 1 from meus_departamentos(c.organizacao_id) d where d=dest) then raise exception 'Equipe não autorizada';end if;
 if p_membro_id is not null and not exists(select 1 from membros_organizacao m where m.id=p_membro_id and m.ativo and m.organizacao_id=c.organizacao_id and(m.papel in('ADMIN','SUPER_ADMIN') or dest is null or exists(select 1 from membros_departamento md where md.membro_id=m.id and md.departamento_id=dest))) then raise exception 'Consultor não pertence à equipe';end if;
 return operacao_transferir_interno(p_conversa_id,p_departamento_id,p_membro_id,p_ator_membro_id,p_ator,p_motivo);
end $$;
create function transferir_com_nota(p_conversa uuid,p_equipe uuid,p_membro uuid,p_ator uuid,p_motivo text,p_nota text) returns boolean language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 c:=autorizar_operacao(p_conversa,p_ator,'TRANSFERIR');
 if not transferir_conversa(p_conversa,p_equipe,p_membro,p_ator,'ATENDENTE',p_motivo) then return false;end if;
 if length(trim(coalesce(p_nota,'')))>0 then insert into notas_internas(organizacao_id,conversa_id,autor_membro_id,conteudo) values(c.organizacao_id,c.id,p_ator,left(p_nota,2000));end if;
 return true;
end $$;
create function devolver_conversa_para_ia(p_conversa_id uuid,p_membro_id uuid,p_motivo text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin c:=autorizar_operacao(p_conversa_id,p_membro_id,'DEVOLVER');
 if not exists(select 1 from canais where id=c.canal_id and ativo and ia_ativa) then return false;end if;
 return operacao_devolver_interno(p_conversa_id,p_membro_id,p_motivo);end $$;
create function encerrar_conversa(p_conversa_id uuid,p_membro_id uuid,p_motivo text default null) returns boolean language plpgsql security definer set search_path=public as $$
begin perform autorizar_operacao(p_conversa_id,p_membro_id,'ENCERRAR');return operacao_encerrar_interno(p_conversa_id,p_membro_id,p_motivo);end $$;
create function reabrir_conversa(p_conversa_id uuid,p_membro_id uuid,p_para_ia boolean default false) returns boolean language plpgsql security definer set search_path=public as $$
begin perform autorizar_operacao(p_conversa_id,p_membro_id,'REABRIR');return operacao_reabrir_interno(p_conversa_id,p_membro_id,p_para_ia);end $$;
revoke all on function assumir_conversa(uuid,uuid,text),transferir_conversa(uuid,uuid,uuid,uuid,autor_mensagem,text),transferir_com_nota(uuid,uuid,uuid,uuid,text,text),devolver_conversa_para_ia(uuid,uuid,text),encerrar_conversa(uuid,uuid,text),reabrir_conversa(uuid,uuid,boolean) from public,anon;
grant execute on function assumir_conversa(uuid,uuid,text),transferir_conversa(uuid,uuid,uuid,uuid,autor_mensagem,text),transferir_com_nota(uuid,uuid,uuid,uuid,text,text),devolver_conversa_para_ia(uuid,uuid,text),encerrar_conversa(uuid,uuid,text),reabrir_conversa(uuid,uuid,boolean) to authenticated,service_role;
