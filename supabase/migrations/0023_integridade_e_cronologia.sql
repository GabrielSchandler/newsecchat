-- A chegada de mensagem não muda quem atende nem pode se perder durante um envio.
create or replace function proteger_transicao_em_envio() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.estado,new.responsavel_id,new.departamento_id) is distinct from (old.estado,old.responsavel_id,old.departamento_id)
 and not(new.estado in('IA','AGUARDANDO_CLIENTE') and old.estado in('IA','AGUARDANDO_CLIENTE') and new.responsavel_id is not distinct from old.responsavel_id and new.departamento_id is not distinct from old.departamento_id) then
  if exists(select 1 from mensagens where conversa_id=old.id and despacho_iniciado_em is not null and(status in('PENDENTE','ENFILEIRADA') or despacho_incerto)) then
   raise exception 'Existe um envio em confirmação. Aguarde ou confira a entrega no canal antes de mudar o atendimento.';
  end if;
 end if;
 return new;
end $$;

-- A autoria de uma nota é imutável e pertence a quem a escreveu.
drop policy operacao_criar on notas_internas;
drop policy operacao_editar on notas_internas;
drop policy operacao_remover on notas_internas;
create policy nota_criar on notas_internas for insert with check(conversa_visivel(conversa_id) and autor_membro_id=meu_membro_id(organizacao_id) and exists(select 1 from conversas c where c.id=conversa_id and c.organizacao_id=notas_internas.organizacao_id));
create policy nota_editar on notas_internas for update using(conversa_visivel(conversa_id) and autor_membro_id=meu_membro_id(organizacao_id)) with check(conversa_visivel(conversa_id) and autor_membro_id=meu_membro_id(organizacao_id));
create policy nota_remover on notas_internas for delete using(conversa_visivel(conversa_id) and (autor_membro_id=meu_membro_id(organizacao_id) or eh_supervisor_ou_acima(organizacao_id)));

-- Supervisores só publicam modelos nas equipes autorizadas; modelos globais exigem gestão.
drop policy respostas_escrever on respostas_rapidas;
create policy respostas_escrever on respostas_rapidas for all using(pertence_organizacao(organizacao_id) and ((not compartilhada and autor_id=meu_membro_id(organizacao_id)) or (compartilhada and (eh_gestor(organizacao_id) or eh_supervisor_ou_acima(organizacao_id) and departamento_id in(select meus_departamentos(organizacao_id)))))) with check(pertence_organizacao(organizacao_id) and autor_id=meu_membro_id(organizacao_id) and (not compartilhada or eh_gestor(organizacao_id) or eh_supervisor_ou_acima(organizacao_id) and departamento_id in(select meus_departamentos(organizacao_id))) and (departamento_id is null or exists(select 1 from departamentos d where d.id=departamento_id and d.organizacao_id=respostas_rapidas.organizacao_id)));

create function validar_destinatario_retorno() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;m membros_organizacao%rowtype;
begin
 select * into c from conversas where id=new.conversa_id;
 select * into m from membros_organizacao where id=new.responsavel_id and organizacao_id=new.organizacao_id and ativo;
 if m.id is null or c.organizacao_id is distinct from new.organizacao_id or not coalesce(m.papel in('ADMIN','SUPER_ADMIN') or c.responsavel_id=m.id or m.escopo_conversas='EQUIPE' and (c.departamento_id is null and m.pode_assumir or exists(select 1 from membros_departamento md where md.membro_id=m.id and md.departamento_id=c.departamento_id)),false) then raise exception 'Responsável sem acesso ao atendimento';end if;
 if auth.uid() is not null and not eh_supervisor_ou_acima(new.organizacao_id) and new.responsavel_id is distinct from meu_membro_id(new.organizacao_id) then raise exception 'Responsável não autorizado';end if;
 return new;
end $$;
create trigger retorno_destinatario before insert or update of responsavel_id,conversa_id on retornos for each row execute function validar_destinatario_retorno();

create or replace view fila_operacional with(security_invoker=true) as
with base as (
 select c.*, coalesce(nullif(ct.nome,''),ct.nome_perfil_whatsapp,ct.telefone) contato_nome,
 ct.telefone contato_telefone, ct.email contato_email, ca.nome canal_nome,ca.status::text canal_status,
 d.nome equipe_nome,p.nome responsavel_nome, u.autor::text ultimo_autor,coalesce(u.enviado_em,u.criado_em) ultimo_publico_em,u.conteudo ultimo_texto,
 coalesce(e.inicio,pend.inicio) espera_desde,e.prazo prazo_resposta,
 rt.id retorno_id,rt.prazo retorno_prazo,rt.motivo retorno_motivo,
 c.estado in('HUMANO','AGUARDANDO_HUMANO') and (e.id is not null or pend.inicio is not null or c.estado='AGUARDANDO_HUMANO') para_responder,
 c.estado<>'ENCERRADA' and e.id is null and u.autor='ATENDENTE' and pend.inicio is null and c.estado<>'AGUARDANDO_HUMANO' aguardando_cliente,
 c.estado in('HUMANO','AGUARDANDO_HUMANO') and c.responsavel_id is null sem_responsavel,
 c.estado in('IA','AGUARDANDO_CLIENTE') com_ia,
 c.estado<>'ENCERRADA' and not exists(select 1 from eventos_conversa ev where ev.conversa_id=c.id and ev.tipo in('ASSUMIU','TRANSFERIDA')) novo,
 coalesce(rt.prazo<now(),false) retorno_vencido,coalesce(e.prazo<now() and e.primeira,false) resposta_vencida,
 c.estado<>'ENCERRADA' and u.autor='ATENDENTE' and pend.inicio is null and rt.id is null and prazo_retorno_util(coalesce(u.enviado_em,u.criado_em),r.id)<=now() sugestao_retorno,
 (select count(*)::int from mensagens mf where mf.conversa_id=c.id and mf.status='FALHOU') falhas_envio,
 coalesce((select jsonb_agg(jsonb_build_object('id',et.id,'nome',et.nome,'cor',et.cor)) from etiquetas_contato ec join etiquetas et on et.id=ec.etiqueta_id where ec.contato_id=c.contato_id),'[]'::jsonb) etiquetas,
 (select conteudo from mensagens where conversa_id=c.id and autor='CONTATO' order by coalesce(enviado_em,criado_em) desc,id desc limit 1) ultima_mensagem_cliente,
 h.conteudo ultimo_envio_humano
 from conversas c join contatos ct on ct.id=c.contato_id join canais ca on ca.id=c.canal_id
 left join departamentos d on d.id=c.departamento_id left join membros_organizacao m on m.id=c.responsavel_id left join perfis p on p.id=m.perfil_id
 left join lateral(select * from regras_atendimento where organizacao_id=c.organizacao_id order by versao desc limit 1) r on true
 left join lateral(select * from mensagens where conversa_id=c.id and tipo<>'SISTEMA' and (direcao='ENTRADA' or status in('ENVIADA','ENTREGUE','LIDA')) order by coalesce(enviado_em,criado_em) desc,id desc limit 1) u on true
 left join lateral(select * from mensagens where conversa_id=c.id and autor='ATENDENTE' and status in('ENVIADA','ENTREGUE','LIDA') order by coalesce(enviado_em,criado_em) desc,id desc limit 1) h on true
 left join lateral(select min(criado_em) inicio from mensagens where conversa_id=c.id and autor='CONTATO' and criado_em>coalesce(h.enviado_em,h.criado_em,'-infinity'::timestamptz)) pend on true
 left join esperas_humanas e on e.conversa_id=c.id and e.respondida_em is null
 left join lateral(select * from retornos where conversa_id=c.id and estado='PENDENTE' order by prazo,id limit 1) rt on true
)
select base.*,case when resposta_vencida then 0 when estado='AGUARDANDO_HUMANO' then 1 when retorno_vencido then 2 when sem_responsavel or novo then 3 when para_responder then 4 else 5 end prioridade_operacional,
 (select not i.sucesso from interacoes_ia i where i.conversa_id=base.id order by i.criado_em desc,i.id desc limit 1) falha_ia,
 (select m.autor_membro_id from mensagens m where m.conversa_id=base.id and m.tipo<>'SISTEMA' and(m.direcao='ENTRADA' or m.status in('ENVIADA','ENTREGUE','LIDA')) order by coalesce(m.enviado_em,m.criado_em) desc,m.id desc limit 1) ultimo_autor_membro,
 exists(select 1 from mensagens m where m.conversa_id=base.id and(m.despacho_incerto or m.despacho_iniciado_em<now()-interval '2 minutes' and m.status='ENFILEIRADA')) envio_incerto,
 exists(select 1 from esperas_humanas eh where eh.conversa_id=base.id and eh.respondida_em is null and eh.primeira and eh.alerta_em<=now() and eh.prazo>now()) alerta_resposta
 from base;
