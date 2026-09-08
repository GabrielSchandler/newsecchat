-- =====================================================================
-- 0009 — Armazenamento de mídia, tempo real e indicadores do painel
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bucket de mídia
--
-- Privado. O caminho SEMPRE começa pelo id da organização
-- (`<organizacao_id>/<ano>/<mes>/<arquivo>`), e é isso que a política
-- confere. Sem esse prefixo, um arquivo não pertence a ninguém e não é
-- lido por ninguém.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "midias: membro lê da própria organização" on storage.objects;
create policy "midias: membro lê da própria organização" on storage.objects
  for select using (
    bucket_id = 'midias'
    and pertence_organizacao(nullif((storage.foldername(name))[1], '')::uuid)
  );

drop policy if exists "midias: membro envia na própria organização" on storage.objects;
create policy "midias: membro envia na própria organização" on storage.objects
  for insert with check (
    bucket_id = 'midias'
    and pertence_organizacao(nullif((storage.foldername(name))[1], '')::uuid)
  );

drop policy if exists "midias: gestor remove da própria organização" on storage.objects;
create policy "midias: gestor remove da própria organização" on storage.objects
  for delete using (
    bucket_id = 'midias'
    and eh_gestor(nullif((storage.foldername(name))[1], '')::uuid)
  );

-- ---------------------------------------------------------------------
-- Tempo real
--
-- A central precisa atualizar sozinha. `replica identity full` é o que
-- faz o evento de UPDATE chegar com a linha inteira — sem isso, a tela
-- receberia só as colunas alteradas e precisaria refazer a consulta.
-- ---------------------------------------------------------------------
alter table conversas replica identity full;
alter table mensagens replica identity full;

do $bloco$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'conversas'
    ) then
      alter publication supabase_realtime add table conversas;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'mensagens'
    ) then
      alter publication supabase_realtime add table mensagens;
    end if;
  end if;
end
$bloco$;

-- ---------------------------------------------------------------------
-- Indicadores do painel
--
-- Uma chamada, um retorno. Números reais, contados no banco: quando não
-- há dado, o número é zero — não existe valor de exemplo em lugar nenhum.
-- ---------------------------------------------------------------------
create or replace function indicadores_painel(
  p_organizacao_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $funcao$
declare
  v_resultado jsonb;
begin
  if not pertence_organizacao(p_organizacao_id) then
    raise exception 'Sem acesso a esta organização';
  end if;

  select jsonb_build_object(
    'conversas_no_periodo', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and iniciada_em between p_inicio and p_fim
    ),
    'conversas_abertas', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado <> 'ENCERRADA'
    ),
    'aguardando_humano', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado = 'AGUARDANDO_HUMANO'
    ),
    'ia_atendendo', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado = 'IA'
    ),
    'humanos_atendendo', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado = 'HUMANO'
    ),
    'aguardando_cliente', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado = 'AGUARDANDO_CLIENTE'
    ),
    'encerradas_no_periodo', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and encerrada_em between p_inicio and p_fim
    ),
    'nao_atribuidas', (
      select count(*) from conversas
      where organizacao_id = p_organizacao_id and estado <> 'ENCERRADA' and responsavel_id is null
    ),
    'segundos_ate_primeira_resposta', (
      select coalesce(round(avg(extract(epoch from (primeira_resposta_em - iniciada_em))))::int, 0)
      from conversas
      where organizacao_id = p_organizacao_id
        and iniciada_em between p_inicio and p_fim
        and primeira_resposta_em is not null
    ),
    'segundos_ate_primeira_resposta_humana', (
      select coalesce(round(avg(extract(epoch from (primeira_resposta_humana_em - iniciada_em))))::int, 0)
      from conversas
      where organizacao_id = p_organizacao_id
        and iniciada_em between p_inicio and p_fim
        and primeira_resposta_humana_em is not null
    ),
    'contatos_novos', (
      select count(*) from contatos
      where organizacao_id = p_organizacao_id and criado_em between p_inicio and p_fim
    ),
    'mensagens_recebidas', (
      select count(*) from mensagens
      where organizacao_id = p_organizacao_id and direcao = 'ENTRADA'
        and criado_em between p_inicio and p_fim
    ),
    'mensagens_enviadas', (
      select count(*) from mensagens
      where organizacao_id = p_organizacao_id and direcao = 'SAIDA'
        and criado_em between p_inicio and p_fim
    ),
    'transferencias', (
      select count(*) from eventos_conversa
      where organizacao_id = p_organizacao_id and tipo = 'TRANSFERIDA'
        and criado_em between p_inicio and p_fim
    ),
    'campanhas_em_execucao', (
      select count(*) from campanhas
      where organizacao_id = p_organizacao_id and status = 'EM_EXECUCAO'
    ),
    'campanha_mensagens_enviadas', (
      select coalesce(sum(enviados), 0) from campanhas
      where organizacao_id = p_organizacao_id and coalesce(iniciada_em, criado_em) between p_inicio and p_fim
    ),
    'campanha_respostas', (
      select coalesce(sum(respondidos), 0) from campanhas
      where organizacao_id = p_organizacao_id and coalesce(iniciada_em, criado_em) between p_inicio and p_fim
    ),
    'por_departamento', (
      select coalesce(jsonb_agg(linha), '[]'::jsonb) from (
        select d.id, d.nome, d.cor,
               count(c.id) filter (where c.estado <> 'ENCERRADA') as abertas
        from departamentos d
        left join conversas c on c.departamento_id = d.id
        where d.organizacao_id = p_organizacao_id and d.ativo
        group by d.id, d.nome, d.cor, d.ordem
        order by d.ordem, d.nome
      ) as linha
    ),
    'volume_por_dia', (
      select coalesce(jsonb_agg(linha order by linha ->> 'dia'), '[]'::jsonb) from (
        select jsonb_build_object(
          'dia', to_char(dia, 'YYYY-MM-DD'),
          'recebidas', recebidas,
          'enviadas', enviadas
        ) as linha
        from (
          select date_trunc('day', criado_em) as dia,
                 count(*) filter (where direcao = 'ENTRADA') as recebidas,
                 count(*) filter (where direcao = 'SAIDA') as enviadas
          from mensagens
          where organizacao_id = p_organizacao_id and criado_em between p_inicio and p_fim
          group by 1
        ) as agregado
      ) as linha
    )
  ) into v_resultado;

  return v_resultado;
end;
$funcao$;

-- Contagem das caixas da coluna esquerda da central. Uma chamada em vez
-- de nove consultas do navegador.
create or replace function contagens_caixas(p_organizacao_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $funcao$
declare
  v_membro uuid;
begin
  if not pertence_organizacao(p_organizacao_id) then
    raise exception 'Sem acesso a esta organização';
  end if;

  v_membro := meu_membro_id(p_organizacao_id);

  return (
    select jsonb_build_object(
      'minhas', count(*) filter (where responsavel_id = v_membro and estado <> 'ENCERRADA'),
      'nao_atribuidas', count(*) filter (where responsavel_id is null and estado <> 'ENCERRADA'),
      'ia', count(*) filter (where estado = 'IA'),
      'aguardando_humano', count(*) filter (where estado = 'AGUARDANDO_HUMANO'),
      'aguardando_cliente', count(*) filter (where estado = 'AGUARDANDO_CLIENTE'),
      'humano', count(*) filter (where estado = 'HUMANO'),
      'encerradas', count(*) filter (where estado = 'ENCERRADA'),
      'todas', count(*) filter (where estado <> 'ENCERRADA')
    )
    from conversas
    where organizacao_id = p_organizacao_id
      and pode_ver_conversa(organizacao_id, departamento_id, responsavel_id)
  );
end;
$funcao$;
