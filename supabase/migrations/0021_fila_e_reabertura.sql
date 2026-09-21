create function prazo_retorno_util(p_inicio timestamptz,p_regra uuid) returns timestamptz language plpgsql stable set search_path=public as $$
declare r regras_atendimento%rowtype;d date;n int:=0;
begin select * into r from regras_atendimento where id=p_regra;if not found then return null;end if;
 for i in 1..730 loop d:=(p_inicio at time zone r.fuso)::date+i;
 if extract(isodow from d)::int=any(r.dias) and not(d::text=any(r.feriados)) then n:=n+1;end if;
 if n>=r.retorno_dias then return(d+(p_inicio at time zone r.fuso)::time) at time zone r.fuso;end if;
 end loop;return null;
end $$;
create or replace view fila_operacional with(security_invoker=true) as
with base as (
 select c.*, coalesce(nullif(ct.nome,''),ct.nome_perfil_whatsapp,ct.telefone) contato_nome,
 ct.telefone contato_telefone, ct.email contato_email, ca.nome canal_nome,ca.status::text canal_status,
 d.nome equipe_nome,p.nome responsavel_nome, u.autor::text ultimo_autor,u.criado_em ultimo_publico_em,u.conteudo ultimo_texto,
 coalesce(e.inicio,pend.inicio) espera_desde,e.prazo prazo_resposta,
 rt.id retorno_id,rt.prazo retorno_prazo,rt.motivo retorno_motivo,
 c.estado in('HUMANO','AGUARDANDO_HUMANO') and (e.id is not null or pend.inicio is not null or c.estado='AGUARDANDO_HUMANO') para_responder,
 c.estado<>'ENCERRADA' and u.autor='ATENDENTE' and pend.inicio is null and c.estado<>'AGUARDANDO_HUMANO' aguardando_cliente,
 c.estado in('HUMANO','AGUARDANDO_HUMANO') and c.responsavel_id is null sem_responsavel,
 c.estado in('IA','AGUARDANDO_CLIENTE') com_ia,
 c.estado<>'ENCERRADA' and not exists(select 1 from eventos_conversa ev where ev.conversa_id=c.id and ev.tipo in('ASSUMIU','TRANSFERIDA')) novo,
 coalesce(rt.prazo<now(),false) retorno_vencido,coalesce(e.prazo<now() and e.primeira,false) resposta_vencida,
 c.estado<>'ENCERRADA' and u.autor='ATENDENTE' and pend.inicio is null and rt.id is null and prazo_retorno_util(u.criado_em,r.id)<=now() sugestao_retorno,
 (select count(*)::int from mensagens mf where mf.conversa_id=c.id and mf.status='FALHOU') falhas_envio,
 coalesce((select jsonb_agg(jsonb_build_object('id',et.id,'nome',et.nome,'cor',et.cor)) from etiquetas_contato ec join etiquetas et on et.id=ec.etiqueta_id where ec.contato_id=c.contato_id),'[]'::jsonb) etiquetas,
 (select conteudo from mensagens where conversa_id=c.id and autor='CONTATO' order by criado_em desc,id desc limit 1) ultima_mensagem_cliente,
 h.conteudo ultimo_envio_humano
 from conversas c join contatos ct on ct.id=c.contato_id join canais ca on ca.id=c.canal_id
 left join departamentos d on d.id=c.departamento_id left join membros_organizacao m on m.id=c.responsavel_id left join perfis p on p.id=m.perfil_id
 left join lateral(select * from regras_atendimento where organizacao_id=c.organizacao_id order by versao desc limit 1) r on true
 left join lateral(select * from mensagens where conversa_id=c.id and tipo<>'SISTEMA' and (direcao='ENTRADA' or status in('ENVIADA','ENTREGUE','LIDA')) order by criado_em desc,id desc limit 1) u on true
 left join lateral(select * from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA') order by criado_em desc,id desc limit 1) h on true
 left join lateral(select min(criado_em) inicio from mensagens where conversa_id=c.id and autor='CONTATO' and criado_em>coalesce(h.criado_em,'-infinity'::timestamptz)) pend on true
 left join esperas_humanas e on e.conversa_id=c.id and e.respondida_em is null
 left join lateral(select * from retornos where conversa_id=c.id and estado='PENDENTE' order by prazo,id limit 1) rt on true
)
select base.*,case when resposta_vencida then 0 when estado='AGUARDANDO_HUMANO' then 1 when retorno_vencido then 2 when sem_responsavel or novo then 3 when para_responder then 4 else 5 end prioridade_operacional,
 (select not i.sucesso from interacoes_ia i where i.conversa_id=base.id order by i.criado_em desc,i.id desc limit 1) falha_ia,
 (select m.autor_membro_id from mensagens m where m.conversa_id=base.id and m.tipo<>'SISTEMA' and(m.direcao='ENTRADA' or m.status in('ENVIADA','ENTREGUE','LIDA')) order by m.criado_em desc,m.id desc limit 1) ultimo_autor_membro,
 exists(select 1 from mensagens m where m.conversa_id=base.id and(m.despacho_incerto or m.despacho_iniciado_em<now()-interval '2 minutes' and m.status='ENFILEIRADA')) envio_incerto
 from base;

create function reabrir_ao_receber(p_contato uuid,p_canal uuid,p_org uuid) returns setof conversas language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 if not coalesce((select reabrir from regras_atendimento where organizacao_id=p_org order by versao desc limit 1),false) then return;end if;
 select * into c from conversas where contato_id=p_contato and canal_id=p_canal and organizacao_id=p_org and estado='ENCERRADA' order by encerrada_em desc,id limit 1 for update;
 if not found or exists(select 1 from conversas where contato_id=p_contato and canal_id=p_canal and estado<>'ENCERRADA') then return;end if;
 update conversas set estado='AGUARDANDO_HUMANO',encerrada_em=null,encerrada_por=null,motivo_encerramento=null,versao=versao+1 where id=c.id returning * into c;
 insert into eventos_conversa(organizacao_id,conversa_id,tipo,estado_anterior,estado_novo,motivo) values(p_org,c.id,'REABERTA','ENCERRADA','AGUARDANDO_HUMANO','Nova mensagem recebida; regra de reabertura ativa');
 return next c;
 exception when unique_violation then return;
end $$;
revoke all on function reabrir_ao_receber(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function reabrir_ao_receber(uuid,uuid,uuid) to service_role;
create function validar_envio_humano() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 if new.autor='ATENDENTE' and new.direcao='SAIDA' then
 select * into c from conversas where id=new.conversa_id for update;
 if c.estado<>'HUMANO' or c.responsavel_id is distinct from new.autor_membro_id or c.organizacao_id<>new.organizacao_id or c.canal_id<>new.canal_id or c.contato_id<>new.contato_id then raise exception 'O atendimento mudou. Atualize antes de enviar.';end if;
 end if;return new;
end $$;
create trigger mensagem_validar_humano before insert on mensagens for each row execute function validar_envio_humano();
create function sincronizar_regra_organizacao() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.fuso) or cardinality(new.dias)=0 or jsonb_array_length(new.intervalos)=0 then raise exception 'Calendário inválido';end if;
 update organizacoes set fuso_horario=new.fuso where id=new.organizacao_id;return new;
end $$;
create trigger regra_sincronizar after insert on regras_atendimento for each row execute function sincronizar_regra_organizacao();
