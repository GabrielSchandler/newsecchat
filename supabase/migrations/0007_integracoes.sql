-- =====================================================================
-- 0007 — Integrações externas. Hoje: Google Sheets.
--
-- A planilha é a origem de lead mais comum de quem ainda não tem CRM. O
-- risco dela é reprocessar a mesma linha e disparar a mesma mensagem duas
-- vezes: `linhas_planilha_processadas` com chave única resolve isso — a
-- importação pode rodar quantas vezes quiser sem duplicar nada.
-- =====================================================================

do $bloco$ begin
  create type tipo_integracao as enum ('GOOGLE_SHEETS');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_integracao as enum ('DESCONECTADA', 'CONECTADA', 'ERRO', 'EXPIRADA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_linha_planilha as enum ('IMPORTADA', 'IGNORADA', 'FALHOU');
exception when duplicate_object then null; end $bloco$;

create table if not exists integracoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  tipo tipo_integracao not null,
  nome text not null,
  status status_integracao not null default 'DESCONECTADA',
  -- Tokens do OAuth. Esta coluna NUNCA é lida pelo navegador: só o
  -- servidor, com a chave de serviço, a acessa. Ver a view
  -- `integracoes_visiveis` abaixo e lib/integracoes/google.ts.
  credenciais jsonb not null default '{}'::jsonb,
  configuracao jsonb not null default '{}'::jsonb,
  conta_externa text,
  ultimo_erro text,
  criado_por uuid references membros_organizacao (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, tipo, nome)
);

create trigger integracoes_atualizado before update on integracoes
  for each row execute function marcar_atualizado_em();

create table if not exists integracoes_google_sheets (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  integracao_id uuid not null references integracoes (id) on delete cascade,
  planilha_id text not null,
  nome_planilha text,
  aba text not null default 'Página1',
  intervalo text not null default 'A:Z',
  -- Coluna que identifica a linha de forma estável. Sem ela, cai para o
  -- número da linha — que muda se alguém inserir linha no meio, e por
  -- isso o hash do conteúdo também entra na chave.
  coluna_identificadora text,
  -- { "telefone": "B", "nome": "A", "campo:banco": "D" }
  mapeamento_colunas jsonb not null default '{}'::jsonb,
  primeira_linha_dados int not null default 2,
  intervalo_minutos int not null default 15,
  etiqueta_id uuid references etiquetas (id) on delete set null,
  campanha_id uuid references campanhas (id) on delete set null,
  criar_conversa boolean not null default false,
  ativo boolean not null default true,
  ultima_sincronizacao_em timestamptz,
  ultimo_erro text,
  total_importados int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists integracoes_sheets_org_idx on integracoes_google_sheets (organizacao_id) where ativo;

create trigger integracoes_sheets_atualizado before update on integracoes_google_sheets
  for each row execute function marcar_atualizado_em();

create table if not exists linhas_planilha_processadas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  integracao_sheets_id uuid not null references integracoes_google_sheets (id) on delete cascade,
  identificador_linha text not null,
  hash_conteudo text not null,
  contato_id uuid references contatos (id) on delete set null,
  status status_linha_planilha not null default 'IMPORTADA',
  erro text,
  criado_em timestamptz not null default now(),
  -- A chave da idempotência da planilha.
  unique (integracao_sheets_id, identificador_linha)
);

create index if not exists linhas_planilha_org_idx on linhas_planilha_processadas (organizacao_id, criado_em desc);

-- View sem as credenciais, para leitura no navegador.
create or replace view integracoes_visiveis
with (security_invoker = true) as
  select id, organizacao_id, tipo, nome, status, configuracao, conta_externa,
         ultimo_erro, criado_por, criado_em, atualizado_em,
         (credenciais ? 'refresh_token') as possui_credenciais
  from integracoes;

alter table integracoes enable row level security;
alter table integracoes_google_sheets enable row level security;
alter table linhas_planilha_processadas enable row level security;

-- Só gestor vê integração: a linha carrega token de acesso à conta Google
-- da empresa.
create policy "integracoes: gestor lê" on integracoes
  for select using (eh_gestor(organizacao_id));
create policy "integracoes: gestor escreve" on integracoes
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "sheets: gestor lê" on integracoes_google_sheets
  for select using (eh_gestor(organizacao_id));
create policy "sheets: gestor escreve" on integracoes_google_sheets
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "linhas planilha: gestor lê" on linhas_planilha_processadas
  for select using (eh_gestor(organizacao_id));
