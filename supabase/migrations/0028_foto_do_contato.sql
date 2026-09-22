-- Foto de perfil do contato, importada do WhatsApp.
--
-- Guardamos a URL que a Evolution devolve (ela mesma hospeda/repassa a
-- imagem); não baixamos o arquivo. O worker preenche isso sozinho ao
-- resolver um contato sem foto (ver resolverContato em
-- lib/servicos/conversas.ts) — melhor esforço, nunca bloqueia a chegada
-- da mensagem se a Evolution não responder.
alter table contatos add column if not exists foto_url text;

-- A view precisa reexpor a coluna nova pra a lista de atendimento e o
-- cabeçalho da conversa mostrarem a foto sem uma consulta extra. Recriada
-- por inteiro porque `create or replace view` exige o texto todo de novo
-- — o resto é idêntico ao de 0023_integridade_e_cronologia.sql.
--
-- `contato_foto` entra só no SELECT final, depois de `alerta_resposta` —
-- não dentro do CTE `base`. `create or replace view` só aceita uma coluna
-- nova bem no fim da lista final da view; a lista final começa com
-- `base.*`, então qualquer coluna somada dentro de `base` cairia no meio
-- (antes de `prioridade_operacional` e das demais), e o Postgres recusa.
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
 exists(select 1 from esperas_humanas eh where eh.conversa_id=base.id and eh.respondida_em is null and eh.primeira and eh.alerta_em<=now() and eh.prazo>now()) alerta_resposta,
 ct2.foto_url contato_foto
 from base join contatos ct2 on ct2.id=base.contato_id;
