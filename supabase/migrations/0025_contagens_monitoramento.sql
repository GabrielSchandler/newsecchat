create or replace function fila_contagens(p_busca text default '',p_equipe uuid default null,p_responsavel uuid default null,p_canal uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('prioridades',count(*) filter(where prioridade_operacional<5),'novos',count(*) filter(where novo),
 'responder',count(*) filter(where para_responder),'retornos',count(*) filter(where retorno_id is not null),'aguardando',count(*) filter(where aguardando_cliente),
 'todos',count(*),'ia',count(*) filter(where com_ia),'sem-responsavel',count(*) filter(where sem_responsavel),'vencidos',count(*) filter(where retorno_vencido),'apoio',count(*) filter(where estado='AGUARDANDO_HUMANO'),'falhas-ia',count(*) filter(where falha_ia))
 from fila_operacional where estado<>'ENCERRADA' and (p_busca='' or contato_nome ilike '%'||p_busca||'%' or contato_telefone like '%'||regexp_replace(p_busca,'[^0-9]','','g')||'%' and length(regexp_replace(p_busca,'[^0-9]','','g'))>=3)
 and (p_equipe is null or departamento_id=p_equipe) and(p_responsavel is null or responsavel_id=p_responsavel) and(p_canal is null or canal_id=p_canal);
$$;
