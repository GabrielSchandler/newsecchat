-- =====================================================================
-- 0001 — Fundação: extensões, organizações, perfis, papéis, departamentos
--        e as funções que sustentam o RLS de toda a aplicação.
--
-- Princípio: TODA tabela de dados carrega `organizacao_id` e toda leitura
-- passa por `pertence_organizacao()`. Não existe consulta sem esse filtro.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- Enums de identidade
-- ---------------------------------------------------------------------
do $bloco$ begin
  create type papel_membro as enum ('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ATENDENTE');
exception when duplicate_object then null; end $bloco$;

-- ---------------------------------------------------------------------
-- Organizações
-- ---------------------------------------------------------------------
create table if not exists organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text not null,
  documento text,
  fuso_horario text not null default 'America/Sao_Paulo',
  plano text not null default 'INTERNO',
  -- Limites por plano. Já existem agora para não exigir migração de
  -- estrutura quando houver cobrança; nada aqui é cobrado hoje.
  limites jsonb not null default jsonb_build_object(
    'canais', 5,
    'membros', 25,
    'mensagens_mes', 50000,
    'campanhas_simultaneas', 3
  ),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists organizacoes_apelido_idx on organizacoes (lower(apelido));

-- ---------------------------------------------------------------------
-- Perfis — espelho de auth.users com os dados que a aplicação usa
-- ---------------------------------------------------------------------
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null,
  telefone text,
  url_avatar text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function criar_perfil_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $funcao$
begin
  insert into perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$funcao$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function criar_perfil_do_usuario();

-- ---------------------------------------------------------------------
-- Membros da organização
-- ---------------------------------------------------------------------
create table if not exists membros_organizacao (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  perfil_id uuid not null references perfis (id) on delete cascade,
  papel papel_membro not null default 'ATENDENTE',
  ativo boolean not null default true,
  -- Atendente disponível para receber atribuição.
  disponivel boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, perfil_id)
);

create index if not exists membros_organizacao_perfil_idx on membros_organizacao (perfil_id);
create index if not exists membros_organizacao_org_idx on membros_organizacao (organizacao_id) where ativo;

-- ---------------------------------------------------------------------
-- Departamentos
-- ---------------------------------------------------------------------
create table if not exists departamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null,
  chave text not null,
  descricao text,
  cor text not null default '#0f766e',
  -- Usado pela IA para decidir a transferência. Texto livre, em português.
  criterio_transferencia text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, chave)
);

create table if not exists membros_departamento (
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  departamento_id uuid not null references departamentos (id) on delete cascade,
  membro_id uuid not null references membros_organizacao (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (departamento_id, membro_id)
);

create index if not exists membros_departamento_membro_idx on membros_departamento (membro_id);

-- =====================================================================
-- Funções de apoio ao RLS
--
-- Todas são SECURITY DEFINER de propósito: uma policy de
-- `membros_organizacao` que consultasse `membros_organizacao` sob RLS
-- entraria em recursão infinita. SECURITY DEFINER com search_path fixo
-- é o padrão para quebrar esse ciclo com segurança.
-- =====================================================================

create or replace function organizacoes_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $funcao$
  select m.organizacao_id
  from membros_organizacao m
  where m.perfil_id = auth.uid() and m.ativo;
$funcao$;

create or replace function pertence_organizacao(alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select exists (
    select 1 from membros_organizacao m
    where m.perfil_id = auth.uid() and m.organizacao_id = alvo and m.ativo
  );
$funcao$;

create or replace function papel_na_organizacao(alvo uuid)
returns papel_membro
language sql
stable
security definer
set search_path = public
as $funcao$
  select m.papel from membros_organizacao m
  where m.perfil_id = auth.uid() and m.organizacao_id = alvo and m.ativo
  limit 1;
$funcao$;

-- Gestor = quem pode alterar a configuração da organização.
create or replace function eh_gestor(alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select papel_na_organizacao(alvo) in ('SUPER_ADMIN', 'ADMIN');
$funcao$;

-- Supervisor enxerga toda a operação, mas não altera configuração crítica.
create or replace function eh_supervisor_ou_acima(alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select papel_na_organizacao(alvo) in ('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR');
$funcao$;

create or replace function meu_membro_id(alvo uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $funcao$
  select m.id from membros_organizacao m
  where m.perfil_id = auth.uid() and m.organizacao_id = alvo and m.ativo
  limit 1;
$funcao$;

create or replace function meus_departamentos(alvo uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $funcao$
  select md.departamento_id
  from membros_departamento md
  join membros_organizacao m on m.id = md.membro_id
  where m.perfil_id = auth.uid() and m.organizacao_id = alvo and m.ativo;
$funcao$;

-- Visibilidade de conversa por papel:
--   gestor/supervisor -> toda a organização
--   atendente         -> a sua, as sem departamento (triagem) e as dos
--                        departamentos a que pertence
create or replace function pode_ver_conversa(
  alvo uuid,
  departamento uuid,
  responsavel uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $funcao$
  select
    pertence_organizacao(alvo)
    and (
      eh_supervisor_ou_acima(alvo)
      or (responsavel is not null and responsavel = meu_membro_id(alvo))
      or departamento is null
      or departamento in (select meus_departamentos(alvo))
    );
$funcao$;

-- ---------------------------------------------------------------------
-- Gatilho genérico de atualizado_em
-- ---------------------------------------------------------------------
create or replace function marcar_atualizado_em()
returns trigger
language plpgsql
as $funcao$
begin
  new.atualizado_em = now();
  return new;
end;
$funcao$;

create trigger organizacoes_atualizado before update on organizacoes
  for each row execute function marcar_atualizado_em();
create trigger perfis_atualizado before update on perfis
  for each row execute function marcar_atualizado_em();
create trigger membros_organizacao_atualizado before update on membros_organizacao
  for each row execute function marcar_atualizado_em();
create trigger departamentos_atualizado before update on departamentos
  for each row execute function marcar_atualizado_em();

-- =====================================================================
-- RLS
-- =====================================================================
alter table organizacoes enable row level security;
alter table perfis enable row level security;
alter table membros_organizacao enable row level security;
alter table departamentos enable row level security;
alter table membros_departamento enable row level security;

create policy "organizacoes: membro lê" on organizacoes
  for select using (pertence_organizacao(id));
create policy "organizacoes: gestor atualiza" on organizacoes
  for update using (eh_gestor(id)) with check (eh_gestor(id));

create policy "perfis: lê os visíveis" on perfis
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from membros_organizacao meu
      join membros_organizacao outro on outro.organizacao_id = meu.organizacao_id
      where meu.perfil_id = auth.uid() and meu.ativo and outro.perfil_id = perfis.id
    )
  );
create policy "perfis: atualiza o próprio" on perfis
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "membros: lê os da organização" on membros_organizacao
  for select using (pertence_organizacao(organizacao_id));
create policy "membros: gestor escreve" on membros_organizacao
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "departamentos: lê os da organização" on departamentos
  for select using (pertence_organizacao(organizacao_id));
create policy "departamentos: gestor escreve" on departamentos
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "membros_departamento: lê os da organização" on membros_departamento
  for select using (pertence_organizacao(organizacao_id));
create policy "membros_departamento: gestor escreve" on membros_departamento
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));
