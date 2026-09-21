alter table esperas_humanas add column alerta_em timestamptz;
update esperas_humanas e set alerta_em=prazo_util(e.inicio,r.alerta_minutos,r.id) from regras_atendimento r where r.id=e.regra_id and e.respondida_em is null and e.primeira;
-- Instrumentação prospectiva: uma resposta é efetiva após aceitação do provedor.
create or replace function iniciar_espera_humana(p_conversa uuid,p_inicio timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;r regras_atendimento%rowtype;primeira boolean;
begin
 select * into c from conversas where id=p_conversa for update;
 if not found or c.estado not in('HUMANO','AGUARDANDO_HUMANO') then return;end if;
 select * into r from regras_atendimento where organizacao_id=c.organizacao_id order by versao desc limit 1;
 primeira:=not exists(select 1 from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA'));
 insert into esperas_humanas(organizacao_id,conversa_id,inicio,regra_id,equipe_id,primeira,prazo,alerta_em)
 values(c.organizacao_id,c.id,p_inicio,r.id,c.departamento_id,primeira,case when primeira and r.id is not null then prazo_util(p_inicio,r.meta_minutos,r.id) else null end,case when primeira and r.id is not null then prazo_util(p_inicio,r.alerta_minutos,r.id) else null end)
 on conflict(conversa_id) where respondida_em is null do nothing;
end $$;
create or replace view fila_operacional with(security_invoker=true) as
with base as (
 select c.*, coalesce(nullif(ct.nome,''),ct.nome_perfil_whatsapp,ct.telefone) contato_nome,
 ct.telefone contato_telefone, ct.email contato_email, ca.nome canal_nome,ca.status::text canal_status,
 d.nome equipe_nome,p.nome responsavel_nome, u.autor::text ultimo_autor,u.criado_em ultimo_publico_em,u.conteudo ultimo_texto,
 coalesce(e.inicio,pend.inicio) espera_desde,e.prazo prazo_resposta,
 rt.id retorno_id,rt.prazo retorno_prazo,rt.motivo retorno_motivo,
 c.estado in('HUMANO','AGUARDANDO_HUMANO') and (e.id is not null or pend.inicio is not null or c.estado='AGUARDANDO_HUMANO') para_responder,
 c.estado<>'ENCERRADA' and e.id is null and u.autor='ATENDENTE' and pend.inicio is null and c.estado<>'AGUARDANDO_HUMANO' aguardando_cliente,
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
 exists(select 1 from mensagens m where m.conversa_id=base.id and(m.despacho_incerto or m.despacho_iniciado_em<now()-interval '2 minutes' and m.status='ENFILEIRADA')) envio_incerto,
 exists(select 1 from esperas_humanas eh where eh.conversa_id=base.id and eh.respondida_em is null and eh.primeira and eh.alerta_em<=now() and eh.prazo>now()) alerta_resposta
 from base;

create or replace view contatos_operacionais with(security_invoker=true) as
select ct.*,f.id conversa_id,f.canal_nome,f.equipe_nome,f.responsavel_nome,f.ultimo_autor,
 f.para_responder,f.retorno_vencido,f.sugestao_retorno,f.com_ia,f.sem_responsavel,f.retorno_prazo,
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome,'cor',e.cor)) from etiquetas_contato ec join etiquetas e on e.id=ec.etiqueta_id where ec.contato_id=ct.id),'[]'::jsonb) etiquetas,
 (select count(*)::int from conversas c where c.contato_id=ct.id and c.estado<>'ENCERRADA') conversas_abertas,f.ultimo_autor_membro
from contatos ct left join lateral(select * from fila_operacional where contato_id=ct.id and estado<>'ENCERRADA' order by prioridade_operacional,ultima_mensagem_em desc nulls last,id limit 1) f on true;

alter table retornos replica identity full;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='retornos') then alter publication supabase_realtime add table retornos;end if;end $$;
create function registrar_primeira_resposta_efetiva() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.autor='ATENDENTE' then update conversas set primeira_resposta_humana_em=(select min(coalesce(enviado_em,criado_em)) from mensagens where conversa_id=new.conversa_id and autor='ATENDENTE' and tipo<>'SISTEMA' and status in('ENVIADA','ENTREGUE','LIDA')) where id=new.conversa_id;end if;return new;
end $$;
create trigger mensagem_primeira_efetiva after insert or update of status on mensagens for each row execute function registrar_primeira_resposta_efetiva();
-- O arquivo só pode ser lido quando o contato também é visível.
drop policy if exists "midias: membro lê da própria organização" on storage.objects;
create policy midias_leitura_operacional on storage.objects for select using(bucket_id='midias' and exists(select 1 from arquivos a where a.caminho=storage.objects.name and contato_visivel(a.contato_id)));
