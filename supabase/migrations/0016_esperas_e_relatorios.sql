-- Instrumentação prospectiva: uma resposta é efetiva após aceitação do provedor.
create function iniciar_espera_humana(p_conversa uuid,p_inicio timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;r regras_atendimento%rowtype;primeira boolean;
begin
 select * into c from conversas where id=p_conversa for update;
 if not found or c.estado not in('HUMANO','AGUARDANDO_HUMANO') then return;end if;
 select * into r from regras_atendimento where organizacao_id=c.organizacao_id order by versao desc limit 1;
 primeira:=not exists(select 1 from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA'));
 insert into esperas_humanas(organizacao_id,conversa_id,inicio,regra_id,equipe_id,primeira,prazo)
 values(c.organizacao_id,c.id,p_inicio,r.id,c.departamento_id,primeira,case when primeira and r.id is not null then prazo_util(p_inicio,r.meta_minutos,r.id) else null end)
 on conflict(conversa_id) where respondida_em is null do nothing;
end $$;
revoke all on function iniciar_espera_humana(uuid,timestamptz) from public,anon,authenticated;
grant execute on function iniciar_espera_humana(uuid,timestamptz) to service_role;

create function instrumentar_evento_conversa() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.estado_novo in('HUMANO','AGUARDANDO_HUMANO') and new.estado_anterior not in('HUMANO','AGUARDANDO_HUMANO') then
  perform iniciar_espera_humana(new.conversa_id,new.criado_em);
 end if;
 return new;
end $$;
create trigger evento_instrumentar after insert on eventos_conversa for each row execute function instrumentar_evento_conversa();

create function instrumentar_mensagem() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;e esperas_humanas%rowtype;resposta mensagens%rowtype;
begin
 if new.tipo='SISTEMA' then return new;end if;
 select * into c from conversas where id=new.conversa_id for update;
 if new.autor='CONTATO' and tg_op='INSERT' and c.estado in('HUMANO','AGUARDANDO_HUMANO') then
  -- Entrada atrasada anterior a uma resposta válida não abre pendência nova.
  if not exists(select 1 from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA') and coalesce(enviado_em,criado_em)>=new.criado_em) then
   perform iniciar_espera_humana(c.id,new.criado_em);
  end if;
 elsif new.autor='ATENDENTE' and new.status in('ENVIADA','ENTREGUE','LIDA') then
  select * into e from esperas_humanas where conversa_id=c.id and respondida_em is null for update;
  if found and coalesce(new.enviado_em,new.criado_em)>=e.inicio then
   update esperas_humanas set resposta_id=new.id,respondida_em=coalesce(new.enviado_em,new.criado_em),autor_id=new.autor_membro_id,equipe_id=c.departamento_id,
    segundos_uteis=case when regra_id is not null then segundos_uteis(inicio,coalesce(new.enviado_em,new.criado_em),regra_id) else null end where id=e.id;
  end if;
 elsif new.autor='ATENDENTE' and new.status='FALHOU' then
  select * into e from esperas_humanas where resposta_id=new.id for update;
  if found then
   select * into resposta from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA') and coalesce(enviado_em,criado_em)>=e.inicio order by coalesce(enviado_em,criado_em),id limit 1;
   if resposta.id is not null then
    update esperas_humanas set resposta_id=resposta.id,respondida_em=coalesce(resposta.enviado_em,resposta.criado_em),autor_id=resposta.autor_membro_id,segundos_uteis=case when regra_id is not null then segundos_uteis(inicio,coalesce(resposta.enviado_em,resposta.criado_em),regra_id) end where id=e.id;
   else
    delete from esperas_humanas where conversa_id=c.id and respondida_em is null and id<>e.id;
    update esperas_humanas set resposta_id=null,respondida_em=null,autor_id=null,segundos_uteis=null where id=e.id;
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger mensagem_instrumentar after insert or update of status on mensagens for each row execute function instrumentar_mensagem();

create function relatorio_atendimento(p_inicio timestamptz,p_fim timestamptz,p_equipe uuid default null,p_canal uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
with elegiveis as (
 select e.*,r.meta_minutos from esperas_humanas e join conversas c on c.id=e.conversa_id left join regras_atendimento r on r.id=e.regra_id
 where e.primeira and e.respondida_em>=p_inicio and e.respondida_em<p_fim
 and(p_equipe is null or e.equipe_id=p_equipe) and(p_canal is null or c.canal_id=p_canal)
),equipes as(
 select e.equipe_id,d.nome,count(*) filter(where e.segundos_uteis is not null) elegiveis,
 count(*) filter(where e.segundos_uteis<=e.meta_minutos*60) dentro_meta,
 percentile_cont(0.5) within group(order by e.segundos_uteis) mediana from elegiveis e left join departamentos d on d.id=e.equipe_id group by e.equipe_id,d.nome
)
select jsonb_build_object(
 'iniciadas',(select count(*) from conversas c where c.iniciada_em>=p_inicio and c.iniciada_em<p_fim and(p_canal is null or c.canal_id=p_canal) and(p_equipe is null or exists(select 1 from eventos_conversa ev where ev.conversa_id=c.id and ev.tipo='CRIADA' and ev.para_departamento_id=p_equipe))),
 'concluidas',(select count(distinct ev.conversa_id) from eventos_conversa ev join conversas c on c.id=ev.conversa_id where ev.tipo='ENCERRADA' and ev.criado_em>=p_inicio and ev.criado_em<p_fim and(p_canal is null or c.canal_id=p_canal) and(p_equipe is null or (ev.metadados->>'equipe_id')::uuid=p_equipe)),
 'elegiveis',(select count(*) from elegiveis where segundos_uteis is not null),
 'excluidas',(select count(*) from elegiveis where segundos_uteis is null),
 'dentro_meta',(select count(*) from elegiveis where segundos_uteis<=meta_minutos*60),
 'mediana',(select percentile_cont(0.5) within group(order by segundos_uteis) from elegiveis),
 'equipes',(select coalesce(jsonb_agg(to_jsonb(equipes)),'[]'::jsonb) from equipes),
 'cobertura',(select min(criado_em) from regras_atendimento),
 'esperas_abertas',(select count(*) from fila_operacional where para_responder and(p_equipe is null or departamento_id=p_equipe) and(p_canal is null or canal_id=p_canal)),
 'esperas_vencidas',(select count(*) from fila_operacional where resposta_vencida and(p_equipe is null or departamento_id=p_equipe) and(p_canal is null or canal_id=p_canal))
);
$$;

-- Fotografia de equipe nos novos eventos; não inventa atribuições antigas.
create function contexto_evento_conversa() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.metadados:=coalesce(new.metadados,'{}'::jsonb)||jsonb_build_object('equipe_id',(select departamento_id from conversas where id=new.conversa_id));return new;
end $$;
create trigger evento_contexto before insert on eventos_conversa for each row execute function contexto_evento_conversa();
create function evento_criacao_conversa() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into eventos_conversa(organizacao_id,conversa_id,tipo,estado_novo,para_departamento_id) values(new.organizacao_id,new.id,'CRIADA',new.estado,new.departamento_id);return new;
end $$;
create trigger conversa_criada after insert on conversas for each row execute function evento_criacao_conversa();
