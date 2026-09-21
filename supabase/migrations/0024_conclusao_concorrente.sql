-- Fechar uma tela desatualizada não pode esconder uma nova mensagem.
create function encerrar_conversa_com_versao(p_conversa_id uuid,p_membro_id uuid,p_versao int,p_motivo text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 c:=autorizar_operacao(p_conversa_id,p_membro_id,'ENCERRAR');
 if c.versao<>p_versao then return false;end if;
 return operacao_encerrar_interno(p_conversa_id,p_membro_id,p_motivo);
end $$;
revoke all on function encerrar_conversa_com_versao(uuid,uuid,int,text) from public,anon;
grant execute on function encerrar_conversa_com_versao(uuid,uuid,int,text) to authenticated,service_role;

-- Cobre também a entrada já associada a uma conversa quando a conclusão
-- acontece entre a resolução do atendimento e a gravação da mensagem.
create function proteger_entrada_concorrente() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 if new.autor<>'CONTATO' or new.direcao<>'ENTRADA' then return new;end if;
 select * into c from conversas where id=new.conversa_id for update;
 if c.estado='ENCERRADA' and new.criado_em>=c.encerrada_em then
  update conversas set estado=case when responsavel_id is null then 'AGUARDANDO_HUMANO'::estado_conversa else 'HUMANO'::estado_conversa end,encerrada_em=null,versao=versao+1 where id=c.id;
  insert into eventos_conversa(organizacao_id,conversa_id,tipo,estado_anterior,estado_novo,ator,motivo)
  values(c.organizacao_id,c.id,'REABERTA','ENCERRADA',case when c.responsavel_id is null then 'AGUARDANDO_HUMANO'::estado_conversa else 'HUMANO'::estado_conversa end,'SISTEMA','Nova mensagem recebida durante a conclusão');
 else
  update conversas set versao=versao+1 where id=c.id;
 end if;
 return new;
end $$;
create trigger mensagem_entrada_concorrente before insert on mensagens for each row execute function proteger_entrada_concorrente();
