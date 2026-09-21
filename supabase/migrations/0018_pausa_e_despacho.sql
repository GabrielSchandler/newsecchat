-- Pausa da IA e despacho com confirmação explícita. Não reenvia resultado desconhecido.
alter table mensagens add column despacho_iniciado_em timestamptz;
alter table mensagens add column despacho_incerto boolean not null default false;

create or replace function registrar_mensagem_ia(p_conversa_id uuid,p_conteudo text,p_chave_idempotencia text,p_metadados jsonb default '{}',p_remetente_nome text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c conversas%rowtype;mid uuid;
begin
 select * into c from conversas where id=p_conversa_id for update;
 if not found or c.estado<>'IA' then return null;end if;
 insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,tipo,conteudo,chave_idempotencia,status,metadados,remetente_nome)
 values(c.organizacao_id,c.id,c.contato_id,c.canal_id,'SAIDA','IA','TEXTO',p_conteudo,p_chave_idempotencia,'PENDENTE',p_metadados,p_remetente_nome)
 on conflict(organizacao_id,chave_idempotencia) where chave_idempotencia is not null do nothing returning id into mid;
 if mid is not null then update conversas set estado='AGUARDANDO_CLIENTE',versao=versao+1 where id=c.id;end if;
 return mid;
end $$;
revoke all on function registrar_mensagem_ia(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function registrar_mensagem_ia(uuid,text,text,jsonb,text) to service_role;
-- A assinatura antiga também não pode contornar a autorização.


create or replace function reservar_despacho_mensagem(p_mensagem_id uuid,p_organizacao_id uuid,p_segundos int default 120)
returns setof mensagens language plpgsql security invoker set search_path=public as $$
declare m mensagens%rowtype;c conversas%rowtype;
begin
 select * into m from mensagens where id=p_mensagem_id and organizacao_id=p_organizacao_id;
 if not found then return;end if;
 -- Todas as decisões compartilham a trava da conversa, antes da mensagem.
 select * into c from conversas where id=m.conversa_id for update;
 select * into m from mensagens where id=p_mensagem_id for update;
 if m.status not in('PENDENTE','ENFILEIRADA') or m.despacho_incerto or m.despacho_iniciado_em is not null or m.despacho_reservado_ate>now() then return;end if;
 if m.autor='IA' and c.estado not in('IA','AGUARDANDO_CLIENTE') or m.autor='ATENDENTE' and(c.estado<>'HUMANO' or c.responsavel_id is distinct from m.autor_membro_id) then
  update mensagens set status='FALHOU',erro='Envio cancelado: o atendimento mudou de responsável ou a IA foi pausada.',despacho_reservado_ate=null where id=m.id;return;
 end if;
 if not exists(select 1 from canais where id=m.canal_id and ativo and status='CONECTADO') then return;end if;
 return query update mensagens set despacho_reservado_ate=now()+make_interval(secs=>p_segundos) where id=m.id returning *;
end $$;

create function iniciar_despacho(p_mensagem uuid,p_org uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare m mensagens%rowtype;c conversas%rowtype;
begin
 select * into m from mensagens where id=p_mensagem and organizacao_id=p_org;
 if not found then return false;end if;
 select * into c from conversas where id=m.conversa_id for update;
 select * into m from mensagens where id=p_mensagem for update;
 if m.status not in('PENDENTE','ENFILEIRADA') or m.despacho_iniciado_em is not null or m.despacho_incerto or m.despacho_reservado_ate is null or m.despacho_reservado_ate<now() then return false;end if;
 if m.autor='IA' and c.estado not in('IA','AGUARDANDO_CLIENTE') or m.autor='ATENDENTE' and(c.estado<>'HUMANO' or c.responsavel_id is distinct from m.autor_membro_id) then
  update mensagens set status='FALHOU',erro='Envio cancelado após mudança no atendimento.',despacho_reservado_ate=null where id=m.id;return false;
 end if;
 update mensagens set despacho_iniciado_em=now(),status='ENFILEIRADA' where id=m.id;return true;
end $$;
revoke all on function iniciar_despacho(uuid,uuid) from public,anon,authenticated;
grant execute on function iniciar_despacho(uuid,uuid) to service_role;

create function proteger_transicao_em_envio() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.estado,new.responsavel_id,new.departamento_id) is distinct from (old.estado,old.responsavel_id,old.departamento_id) then
  if exists(select 1 from mensagens where conversa_id=old.id and despacho_iniciado_em is not null and(status in('PENDENTE','ENFILEIRADA') or despacho_incerto)) then
   raise exception 'Existe um envio em confirmação. Aguarde ou confira a entrega no canal antes de mudar o atendimento.';
  end if;
 end if;
 return new;
end $$;
create trigger conversa_proteger_despacho before update on conversas for each row execute function proteger_transicao_em_envio();

-- Receber não pode sobrescrever uma tomada de posse com um estado lido antes.
create function atualizar_conversa_recebida(p_conversa uuid,p_org uuid,p_previa text,p_recebido timestamptz)
returns estado_conversa language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 select * into c from conversas where id=p_conversa and organizacao_id=p_org for update;
 if not found then raise exception 'Conversa não encontrada';end if;
 update conversas set estado=case when estado='AGUARDANDO_CLIENTE' then 'IA'::estado_conversa else estado end,
 ultima_mensagem_previa=case when ultima_mensagem_em is null or p_recebido>=ultima_mensagem_em then left(p_previa,160) else ultima_mensagem_previa end,
 ultima_mensagem_em=greatest(ultima_mensagem_em,p_recebido),nao_lidas=nao_lidas+1,versao=versao+1 where id=c.id returning * into c;
 update contatos set ultima_interacao_em=greatest(ultima_interacao_em,p_recebido) where id=c.contato_id;
 return c.estado;
end $$;
revoke all on function atualizar_conversa_recebida(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function atualizar_conversa_recebida(uuid,uuid,text,timestamptz) to service_role;

-- Assumir não é responder. Mantém o contrato existente, sem fabricar o indicador.
create or replace function assumir_conversa(p_conversa_id uuid,p_membro_id uuid,p_motivo text default null)
returns boolean language plpgsql security invoker set search_path=public as $$
declare c conversas%rowtype;
begin
 select * into c from conversas where id=p_conversa_id for update;
 if not found or c.estado='ENCERRADA' or(c.responsavel_id is not null and c.responsavel_id<>p_membro_id and c.estado='HUMANO') then return false;end if;
 if auth.role()<>'service_role' and p_membro_id is distinct from meu_membro_id(c.organizacao_id) then raise exception 'Ator inválido';end if;
 if not exists(select 1 from membros_organizacao where id=p_membro_id and organizacao_id=c.organizacao_id and ativo) then return false;end if;
 if c.estado='HUMANO' and c.responsavel_id=p_membro_id then return true;end if;
 update conversas set estado='HUMANO',responsavel_id=p_membro_id,versao=versao+1 where id=c.id;
 insert into eventos_conversa(organizacao_id,conversa_id,tipo,estado_anterior,estado_novo,de_membro_id,para_membro_id,ator_membro_id,ator,motivo)
 values(c.organizacao_id,c.id,'ASSUMIU',c.estado,'HUMANO',c.responsavel_id,p_membro_id,p_membro_id,'ATENDENTE',p_motivo);
 return true;
end $$;

create function confirmar_despacho_status() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status in('ENVIADA','ENTREGUE','LIDA') or(new.status='FALHOU' and not new.despacho_incerto) then
  new.despacho_iniciado_em:=null;new.despacho_reservado_ate:=null;new.despacho_incerto:=false;
 end if;
 return new;
end $$;
create trigger mensagem_confirmar_despacho before update of status on mensagens for each row execute function confirmar_despacho_status();
