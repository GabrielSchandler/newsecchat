-- Recupera a data pública quando o contato ainda não recebeu o agregado.
create or replace view contatos_operacionais with(security_invoker=true) as
select ct.*,f.id conversa_id,f.canal_nome,f.equipe_nome,f.responsavel_nome,f.ultimo_autor,
 f.para_responder,f.retorno_vencido,f.sugestao_retorno,f.com_ia,f.sem_responsavel,f.retorno_prazo,
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome,'cor',e.cor)) from etiquetas_contato ec join etiquetas e on e.id=ec.etiqueta_id where ec.contato_id=ct.id),'[]'::jsonb) etiquetas,
 (select count(*)::int from conversas c where c.contato_id=ct.id and c.estado<>'ENCERRADA') conversas_abertas,f.ultimo_autor_membro,coalesce(ct.ultima_interacao_em,f.ultimo_publico_em) interacao_operacional_em
from contatos ct left join lateral(select * from fila_operacional where contato_id=ct.id and estado<>'ENCERRADA' order by prioridade_operacional,ultima_mensagem_em desc nulls last,id limit 1) f on true;
