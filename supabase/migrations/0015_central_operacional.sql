-- Central operacional: extensão aditiva. Não altera mensagens/histórico existentes.
create table regras_atendimento (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes(id) on delete cascade, versao int not null,
  fuso text not null default 'America/Sao_Paulo', dias int[] not null default '{1,2,3,4,5}',
  intervalos jsonb not null default '[{"inicio":"09:00","fim":"18:00"}]',
  feriados text[] not null default '{}', meta_minutos int not null default 10 check(meta_minutos between 1 and 1440),
  alerta_minutos int not null default 8 check(alerta_minutos >= 0 and alerta_minutos < meta_minutos),
  retorno_dias int not null default 2 check(retorno_dias between 1 and 90), reabrir boolean not null default true,
  criado_em timestamptz not null default now(), criado_por uuid references membros_organizacao(id),
  unique(organizacao_id, versao)
);
create table retornos (
  id uuid primary key default gen_random_uuid(), organizacao_id uuid not null references organizacoes(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade, responsavel_id uuid not null references membros_organizacao(id),
  motivo text not null check(length(trim(motivo)) between 1 and 500), prazo timestamptz not null,
  estado text not null default 'PENDENTE' check(estado in ('PENDENTE','CONCLUIDO','CANCELADO')),
  criado_por uuid not null references membros_organizacao(id), criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(), versao int not null default 1
);
create index retornos_fila_idx on retornos(organizacao_id, responsavel_id, prazo) where estado='PENDENTE';
create index retornos_conversa_idx on retornos(conversa_id, prazo);
create table respostas_rapidas (
  id uuid primary key default gen_random_uuid(), organizacao_id uuid not null references organizacoes(id) on delete cascade,
  autor_id uuid not null references membros_organizacao(id), departamento_id uuid references departamentos(id),
  compartilhada boolean not null default false, nome text not null check(length(nome) between 1 and 100),
  atalho text not null check(atalho ~ '^/[a-z0-9_-]{1,30}$'), categoria text not null default 'Atendimento',
  conteudo text not null check(length(conteudo) between 1 and 4000),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index respostas_pessoais_atalho on respostas_rapidas(organizacao_id, autor_id, atalho) where not compartilhada;
create unique index respostas_equipe_atalho on respostas_rapidas(organizacao_id, coalesce(departamento_id,'00000000-0000-0000-0000-000000000000'::uuid), atalho) where compartilhada;
-- Cada espera guarda a regra vigente. Dados antigos não ganham metas retroativas.
create table esperas_humanas (
  id uuid primary key default gen_random_uuid(), organizacao_id uuid not null references organizacoes(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade, inicio timestamptz not null,
  regra_id uuid references regras_atendimento(id), equipe_id uuid references departamentos(id),
  resposta_id uuid references mensagens(id), respondida_em timestamptz, autor_id uuid references membros_organizacao(id),
  primeira boolean not null default false, prazo timestamptz, segundos_uteis numeric,
  criado_em timestamptz not null default now()
);
create unique index espera_pendente_unica on esperas_humanas(conversa_id) where respondida_em is null;
create index espera_relatorio_idx on esperas_humanas(organizacao_id, respondida_em) where primeira;
create index mensagens_turno_idx on mensagens(conversa_id, criado_em, id) where tipo <> 'SISTEMA';

create function conversa_visivel(p_conversa uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversas c where c.id=p_conversa and pode_ver_conversa(c.organizacao_id,c.departamento_id,c.responsavel_id));
$$;


alter table regras_atendimento enable row level security;
alter table retornos enable row level security;
alter table respostas_rapidas enable row level security;
alter table esperas_humanas enable row level security;
create policy regras_ler on regras_atendimento for select using(pertence_organizacao(organizacao_id));
create policy regras_criar on regras_atendimento for insert with check(eh_gestor(organizacao_id) and criado_por=meu_membro_id(organizacao_id));
create policy retornos_ler on retornos for select using(conversa_visivel(conversa_id));
create policy retornos_criar on retornos for insert with check(conversa_visivel(conversa_id) and pertence_organizacao(organizacao_id) and criado_por=meu_membro_id(organizacao_id));
create policy retornos_editar on retornos for update using(conversa_visivel(conversa_id) and (responsavel_id=meu_membro_id(organizacao_id) or eh_supervisor_ou_acima(organizacao_id))) with check(conversa_visivel(conversa_id));
create policy respostas_ler on respostas_rapidas for select using(pertence_organizacao(organizacao_id) and (autor_id=meu_membro_id(organizacao_id) or (compartilhada and (departamento_id is null or departamento_id in(select meus_departamentos(organizacao_id)) or eh_gestor(organizacao_id)))));
create policy respostas_escrever on respostas_rapidas for all using(pertence_organizacao(organizacao_id) and ((not compartilhada and autor_id=meu_membro_id(organizacao_id)) or (compartilhada and eh_supervisor_ou_acima(organizacao_id)))) with check(pertence_organizacao(organizacao_id) and autor_id=meu_membro_id(organizacao_id) and (not compartilhada or eh_supervisor_ou_acima(organizacao_id)));
create policy esperas_ler on esperas_humanas for select using(conversa_visivel(conversa_id));

-- Interseção de instantes UTC com jornadas locais, inclusive turnos noturnos.
create function segundos_uteis(p_inicio timestamptz, p_fim timestamptz, p_regra uuid)
returns numeric language sql stable set search_path=public as $$
  select coalesce(sum(greatest(0,extract(epoch from least(p_fim, j.fim)-greatest(p_inicio,j.inicio)))),0)
  from regras_atendimento r,
  lateral generate_series((p_inicio at time zone r.fuso)::date-1,(p_fim at time zone r.fuso)::date,interval '1 day') d,
  lateral jsonb_array_elements(r.intervalos) i,
  lateral (select (d::date+(i->>'inicio')::time) at time zone r.fuso as inicio,
    (d::date+(case when (i->>'fim')::time <= (i->>'inicio')::time then 1 else 0 end)+(i->>'fim')::time) at time zone r.fuso as fim) j
  where r.id=p_regra and extract(isodow from d)::int=any(r.dias) and not(d::date::text=any(r.feriados)) and p_fim>p_inicio;
$$;
create function prazo_util(p_inicio timestamptz, p_minutos int, p_regra uuid)
returns timestamptz language plpgsql stable set search_path=public as $$
declare r regras_atendimento%rowtype; j record; restante numeric:=p_minutos*60; duracao numeric;
begin
 select * into r from regras_atendimento where id=p_regra;
 if not found or cardinality(r.dias)=0 then return null; end if;
 for j in select greatest(p_inicio,(d::date+(i->>'inicio')::time) at time zone r.fuso) inicio,
   (d::date+(case when (i->>'fim')::time <= (i->>'inicio')::time then 1 else 0 end)+(i->>'fim')::time) at time zone r.fuso fim
   from generate_series((p_inicio at time zone r.fuso)::date-1,(p_inicio at time zone r.fuso)::date+730,interval '1 day') d,
   lateral jsonb_array_elements(r.intervalos) i
   where extract(isodow from d)::int=any(r.dias) and not(d::date::text=any(r.feriados)) order by 1
 loop
   duracao:=greatest(0,extract(epoch from j.fim-j.inicio));
   if duracao>0 and duracao>=restante then return j.inicio+make_interval(secs=>restante::double precision); end if;
   restante:=restante-duracao;
 end loop;
 return null;
end $$;

create function validar_retorno() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversas%rowtype;
begin
 select * into c from conversas where id=new.conversa_id;
 if c.organizacao_id is distinct from new.organizacao_id or not exists(select 1 from membros_organizacao m where m.id=new.responsavel_id and m.organizacao_id=new.organizacao_id and m.ativo) then raise exception 'Responsável ou conversa inválidos'; end if;
 if tg_op='UPDATE' then
   if new.conversa_id<>old.conversa_id or new.organizacao_id<>old.organizacao_id or new.criado_por<>old.criado_por then raise exception 'Identidade do retorno não pode mudar'; end if;
   new.versao:=old.versao+1; new.atualizado_em:=now();
 end if;
 insert into eventos_conversa(organizacao_id,conversa_id,tipo,ator_membro_id,ator,motivo,metadados)
 values(new.organizacao_id,new.conversa_id,case when tg_op='INSERT' then 'RETORNO_AGENDADO' else 'RETORNO_ATUALIZADO' end,meu_membro_id(new.organizacao_id),'ATENDENTE',new.motivo,
 jsonb_build_object('retorno_id',new.id,'prazo',new.prazo,'estado',new.estado,'prazo_anterior',case when tg_op='UPDATE' then old.prazo else null end));
 return new;
end $$;
create trigger retorno_validar before insert or update on retornos for each row execute function validar_retorno();

create view fila_operacional with(security_invoker=true) as
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
 c.estado<>'ENCERRADA' and u.autor='ATENDENTE' and pend.inicio is null and rt.id is null and u.criado_em<now()-make_interval(days=>coalesce(r.retorno_dias,2)) sugestao_retorno,
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
select base.*,case when resposta_vencida then 0 when estado='AGUARDANDO_HUMANO' then 1 when retorno_vencido then 2 when sem_responsavel or novo then 3 when para_responder then 4 else 5 end prioridade_operacional from base;

grant select on fila_operacional to authenticated,service_role;
grant select,insert on regras_atendimento to authenticated;
grant select,insert,update on retornos to authenticated;
grant select,insert,update,delete on respostas_rapidas to authenticated;
grant select on esperas_humanas to authenticated;
grant all on regras_atendimento,retornos,respostas_rapidas,esperas_humanas to service_role;

-- Uma consulta para contadores e lista: mesmos filtros e mesmo escopo RLS.
create function fila_contagens(p_busca text default '',p_equipe uuid default null,p_responsavel uuid default null,p_canal uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('prioridades',count(*) filter(where prioridade_operacional<5),'novos',count(*) filter(where novo),
 'responder',count(*) filter(where para_responder),'retornos',count(*) filter(where retorno_id is not null),'aguardando',count(*) filter(where aguardando_cliente),
 'todos',count(*),'ia',count(*) filter(where com_ia),'sem-responsavel',count(*) filter(where sem_responsavel),'vencidos',count(*) filter(where retorno_vencido))
 from fila_operacional where estado<>'ENCERRADA' and (p_busca='' or contato_nome ilike '%'||p_busca||'%' or contato_telefone like '%'||regexp_replace(p_busca,'[^0-9]','','g')||'%' and length(regexp_replace(p_busca,'[^0-9]','','g'))>=3)
 and (p_equipe is null or departamento_id=p_equipe) and(p_responsavel is null or responsavel_id=p_responsavel) and(p_canal is null or canal_id=p_canal);
$$;

create function carga_consultores(p_equipe uuid default null,p_canal uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
   select responsavel_id id,coalesce(responsavel_nome,'Sem responsável') nome,count(*) abertas,
   count(*) filter(where para_responder) responder,count(*) filter(where retorno_vencido) vencidos
   from fila_operacional where estado<>'ENCERRADA' and (p_equipe is null or departamento_id=p_equipe) and(p_canal is null or canal_id=p_canal)
   group by responsavel_id,responsavel_nome order by count(*) desc
 ) x;
$$;
