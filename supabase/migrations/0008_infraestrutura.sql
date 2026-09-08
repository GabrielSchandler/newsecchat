-- =====================================================================
-- 0008 — Infraestrutura: eventos de webhook, falhas de fila, auditoria,
--        convites e as chaves estrangeiras que faltavam.
-- =====================================================================

do $bloco$ begin
  create type status_evento_webhook as enum (
    'RECEBIDO', 'ENFILEIRADO', 'PROCESSADO', 'IGNORADO', 'FALHOU'
  );
exception when duplicate_object then null; end $bloco$;

-- ---------------------------------------------------------------------
-- Eventos de webhook
--
-- O endpoint HTTP grava aqui e responde. Nada de pesado acontece dentro
-- da resposta do webhook. A chave única (provedor, identificador_externo)
-- é o que faz reentrega do provedor virar no-op em vez de mensagem
-- duplicada.
-- ---------------------------------------------------------------------
create table if not exists eventos_webhook (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid references organizacoes (id) on delete cascade,
  canal_id uuid references canais (id) on delete set null,
  provedor text not null,
  tipo_evento text not null,
  identificador_externo text not null,
  instancia text,
  carga jsonb not null,
  status status_evento_webhook not null default 'RECEBIDO',
  tentativas int not null default 0,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (provedor, identificador_externo)
);

create index if not exists eventos_webhook_status_idx on eventos_webhook (status, recebido_em);
create index if not exists eventos_webhook_org_idx on eventos_webhook (organizacao_id, recebido_em desc);

-- Retenção: evento cru guarda telefone e texto do cliente. Trinta dias
-- bastam para investigar uma falha; depois disso é dado pessoal parado
-- sem finalidade (LGPD, minimização).
create or replace function limpar_eventos_webhook_antigos()
returns int
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_removidos int;
begin
  delete from eventos_webhook
  where recebido_em < now() - interval '30 days'
    and status in ('PROCESSADO', 'IGNORADO');
  get diagnostics v_removidos = row_count;
  return v_removidos;
end;
$funcao$;

-- ---------------------------------------------------------------------
-- Falhas de fila que esgotaram as tentativas
-- ---------------------------------------------------------------------
create table if not exists falhas_trabalho (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid references organizacoes (id) on delete cascade,
  fila text not null,
  nome_trabalho text not null,
  identificador_trabalho text,
  dados jsonb not null default '{}'::jsonb,
  erro text not null,
  tentativas int not null default 0,
  resolvido boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists falhas_trabalho_idx on falhas_trabalho (fila, criado_em desc) where not resolvido;

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
create table if not exists registros_auditoria (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid references organizacoes (id) on delete cascade,
  ator_perfil_id uuid references perfis (id) on delete set null,
  ator_email text,
  ator_tipo text not null default 'USUARIO',
  acao text not null,
  entidade text,
  entidade_id text,
  metadados jsonb not null default '{}'::jsonb,
  endereco_ip text,
  agente_usuario text,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_org_idx on registros_auditoria (organizacao_id, criado_em desc);
create index if not exists auditoria_acao_idx on registros_auditoria (organizacao_id, acao, criado_em desc);

-- ---------------------------------------------------------------------
-- Convites de usuário
-- ---------------------------------------------------------------------
create table if not exists convites (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  email text not null,
  papel papel_membro not null default 'ATENDENTE',
  departamentos uuid[] not null default array[]::uuid[],
  token text not null default encode(gen_random_bytes(24), 'hex'),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  criado_por uuid references membros_organizacao (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, email)
);

create index if not exists convites_token_idx on convites (token);

-- ---------------------------------------------------------------------
-- Chaves estrangeiras que dependiam de tabelas criadas depois
-- ---------------------------------------------------------------------
alter table conversas drop constraint if exists conversas_campanha_fk;
alter table conversas add constraint conversas_campanha_fk
  foreign key (campanha_id) references campanhas (id) on delete set null;

alter table mensagens drop constraint if exists mensagens_campanha_fk;
alter table mensagens add constraint mensagens_campanha_fk
  foreign key (campanha_id) references campanhas (id) on delete set null;

alter table memorias_contato drop constraint if exists memorias_contato_mensagem_fk;
alter table memorias_contato add constraint memorias_contato_mensagem_fk
  foreign key (mensagem_id) references mensagens (id) on delete set null;

-- =====================================================================
-- RLS
--
-- Estas tabelas são de operação interna: o worker escreve nelas com a
-- chave de serviço (que ignora RLS por definição). Para o navegador,
-- valem só as políticas de leitura abaixo — não há INSERT/UPDATE via
-- cliente, de propósito: log que o usuário pode escrever não é log.
-- =====================================================================
alter table eventos_webhook enable row level security;
alter table falhas_trabalho enable row level security;
alter table registros_auditoria enable row level security;
alter table convites enable row level security;

create policy "eventos webhook: gestor lê" on eventos_webhook
  for select using (organizacao_id is not null and eh_gestor(organizacao_id));

create policy "falhas: gestor lê" on falhas_trabalho
  for select using (organizacao_id is not null and eh_gestor(organizacao_id));

create policy "auditoria: gestor lê" on registros_auditoria
  for select using (organizacao_id is not null and eh_gestor(organizacao_id));

create policy "convites: gestor lê" on convites
  for select using (eh_gestor(organizacao_id));
create policy "convites: gestor escreve" on convites
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));
