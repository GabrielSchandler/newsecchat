-- =====================================================================
-- 0002 — Canais de comunicação (hoje: números de WhatsApp)
--
-- Um canal é um número conectado por um provedor. O provedor é
-- substituível: `EVOLUTION` hoje, `META_CLOUD` amanhã, sem mudar o
-- resto da aplicação.
-- =====================================================================

do $bloco$ begin
  create type tipo_canal as enum ('WHATSAPP');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type provedor_mensageria as enum ('EVOLUTION', 'META_CLOUD', 'SIMULADO');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_canal as enum ('DESCONECTADO', 'CONECTANDO', 'AGUARDANDO_QR', 'CONECTADO', 'ERRO');
exception when duplicate_object then null; end $bloco$;

create table if not exists canais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null,
  tipo tipo_canal not null default 'WHATSAPP',
  provedor provedor_mensageria not null default 'EVOLUTION',
  departamento_id uuid references departamentos (id) on delete set null,
  telefone text,
  -- Nome da instância no provedor. Único no banco INTEIRO, não por
  -- organização: o webhook chega sabendo só esse identificador e precisa
  -- resolver a organização sem ambiguidade. Duas organizações com a mesma
  -- instância entregariam mensagem de uma na caixa da outra.
  identificador_externo text not null,
  -- Segredo próprio deste canal, conferido no webhook. Gerado pela
  -- aplicação; nunca sai para o navegador.
  segredo_webhook text not null default encode(gen_random_bytes(24), 'hex'),
  configuracao jsonb not null default '{}'::jsonb,
  status status_canal not null default 'DESCONECTADO',
  -- IA responde sozinha neste canal? Um número só de disparo fica false.
  ia_ativa boolean not null default true,
  ultima_conexao_em timestamptz,
  ultimo_erro text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint canais_identificador_unico unique (identificador_externo)
);

create index if not exists canais_org_idx on canais (organizacao_id) where ativo;
create index if not exists canais_departamento_idx on canais (departamento_id);

create trigger canais_atualizado before update on canais
  for each row execute function marcar_atualizado_em();

alter table canais enable row level security;

create policy "canais: lê os da organização" on canais
  for select using (pertence_organizacao(organizacao_id));
create policy "canais: gestor escreve" on canais
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

-- O segredo do webhook não pode chegar ao navegador nem por engano.
-- A aplicação lê canais por esta view no cliente; o segredo só é lido
-- pelo servidor, com a chave de serviço.
create or replace view canais_visiveis
with (security_invoker = true) as
  select
    id, organizacao_id, nome, tipo, provedor, departamento_id, telefone,
    identificador_externo, configuracao, status, ia_ativa,
    ultima_conexao_em, ultimo_erro, ativo, criado_em, atualizado_em
  from canais;
