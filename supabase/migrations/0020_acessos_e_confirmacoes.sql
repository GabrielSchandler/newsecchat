create function salvar_acesso_operacional(p_membro uuid,p_papel papel_membro,p_equipes uuid[],p_escopo text,p_assumir boolean,p_transferir boolean)
returns void language plpgsql security definer set search_path=public as $$
declare m membros_organizacao%rowtype;ator uuid;
begin
 select * into m from membros_organizacao where id=p_membro for update;
 if not found or not eh_gestor(m.organizacao_id) then raise exception 'Acesso não autorizado';end if;
 ator:=meu_membro_id(m.organizacao_id);
 if ator=m.id and(p_papel<>m.papel or p_escopo<>m.escopo_conversas or p_assumir<>m.pode_assumir or p_transferir<>m.pode_transferir) then raise exception 'Não altere o próprio acesso';end if;
 if(m.papel='SUPER_ADMIN' or p_papel='SUPER_ADMIN') and papel_na_organizacao(m.organizacao_id)<>'SUPER_ADMIN' then raise exception 'Somente um proprietário pode editar este perfil';end if;
 if m.papel='SUPER_ADMIN' and p_papel<>'SUPER_ADMIN' and(select count(*) from membros_organizacao where organizacao_id=m.organizacao_id and papel='SUPER_ADMIN' and ativo)<2 then raise exception 'Mantenha pelo menos um proprietário';end if;
 if exists(select 1 from unnest(p_equipes) e where not exists(select 1 from departamentos d where d.id=e and d.organizacao_id=m.organizacao_id and d.ativo)) then raise exception 'Equipe inválida';end if;
 update membros_organizacao set papel=p_papel,escopo_conversas=p_escopo,pode_assumir=p_assumir,pode_transferir=p_transferir where id=m.id;
 delete from membros_departamento where membro_id=m.id;
 insert into membros_departamento(organizacao_id,membro_id,departamento_id) select m.organizacao_id,m.id,e from(select distinct unnest(p_equipes) e) x;
 insert into registros_auditoria(organizacao_id,ator_perfil_id,acao,entidade,entidade_id,metadados) values(m.organizacao_id,auth.uid(),'USUARIO_ACESSO_ALTERADO','membros_organizacao',m.id::text,jsonb_build_object('antes',to_jsonb(m),'papel',p_papel,'equipes',p_equipes,'escopo',p_escopo,'assumir',p_assumir,'transferir',p_transferir));
end $$;
revoke all on function salvar_acesso_operacional(uuid,papel_membro,uuid[],text,boolean,boolean) from public,anon;
grant execute on function salvar_acesso_operacional(uuid,papel_membro,uuid[],text,boolean,boolean) to authenticated;

create function saude_canais() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from(select c.id,
 (select count(*) from mensagens m where m.canal_id=c.id and(m.status='FALHOU' or m.despacho_incerto or m.despacho_iniciado_em<now()-interval '2 minutes' and m.status='ENFILEIRADA')) falhas,
 (select max(criado_em) from mensagens m where m.canal_id=c.id) ultimo_evento from canais c) x;
$$;
create function resolver_despacho(p_mensagem uuid,p_entregue boolean) returns void language plpgsql security definer set search_path=public as $$
declare m mensagens%rowtype;c conversas%rowtype;
begin
 select * into m from mensagens where id=p_mensagem;
 if not found then raise exception 'Mensagem não encontrada';end if;
 c:=autorizar_operacao(m.conversa_id,meu_membro_id(m.organizacao_id),'TRANSFERIR');
 if not eh_supervisor_ou_acima(m.organizacao_id) then raise exception 'Somente a supervisão pode conferir a entrega';end if;
 select * into m from mensagens where id=p_mensagem for update;
 if not(m.despacho_incerto or m.despacho_iniciado_em<now()-interval '2 minutes' and m.status='ENFILEIRADA') then raise exception 'A confirmação já mudou. Atualize a conversa.';end if;
 update mensagens set status=case when p_entregue then 'ENVIADA'::status_mensagem else 'FALHOU'::status_mensagem end,
 despacho_incerto=false,despacho_iniciado_em=null,despacho_reservado_ate=null,erro=case when p_entregue then null else 'Conferido manualmente: não enviado. Envie uma nova mensagem se necessário.' end,
 enviado_em=case when p_entregue then coalesce(enviado_em,now()) else enviado_em end where id=m.id;
 insert into eventos_conversa(organizacao_id,conversa_id,tipo,ator_membro_id,ator,motivo,metadados) values(m.organizacao_id,m.conversa_id,'DESPACHO_CONFERIDO',meu_membro_id(m.organizacao_id),'ATENDENTE','Entrega conferida manualmente no canal',jsonb_build_object('mensagem_id',m.id,'entregue',p_entregue));
end $$;
revoke all on function resolver_despacho(uuid,boolean) from public,anon;
grant execute on function resolver_despacho(uuid,boolean) to authenticated;
