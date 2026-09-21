create view contatos_operacionais with(security_invoker=true) as
select ct.*,f.id conversa_id,f.canal_nome,f.equipe_nome,f.responsavel_nome,f.ultimo_autor,
 f.para_responder,f.retorno_vencido,f.sugestao_retorno,f.com_ia,f.sem_responsavel,f.retorno_prazo,
 coalesce(f.etiquetas,'[]'::jsonb) etiquetas,
 (select count(*)::int from conversas c where c.contato_id=ct.id and c.estado<>'ENCERRADA') conversas_abertas
from contatos ct left join lateral(select * from fila_operacional where contato_id=ct.id and estado<>'ENCERRADA' order by prioridade_operacional,ultima_mensagem_em desc nulls last,id limit 1) f on true;
grant select on contatos_operacionais to authenticated,service_role;
create view historico_atendimento with(security_invoker=true) as
select id,organizacao_id,conversa_id,criado_em ocorrido_em,'MENSAGEM'::text tipo,autor::text autor,conteudo,autor_membro_id from mensagens
union all select id,organizacao_id,conversa_id,criado_em,'NOTA','ATENDENTE',conteudo,autor_membro_id from notas_internas
union all select id,organizacao_id,conversa_id,criado_em,tipo,ator::text,coalesce(motivo,tipo),ator_membro_id from eventos_conversa;
grant select on historico_atendimento to authenticated,service_role;
