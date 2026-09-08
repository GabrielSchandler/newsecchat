-- =====================================================================
-- 0003 — Contatos, campos personalizados, etiquetas e memória do contato
--
-- Os campos que a IA precisa coletar NÃO são colunas fixas: cada
-- organização define os seus em `campos_personalizados`. É o que impede
-- a aplicação de nascer amarrada a um único ramo de negócio.
-- =====================================================================

do $bloco$ begin
  create type tipo_campo as enum (
    'TEXTO', 'TEXTO_LONGO', 'NUMERO', 'MOEDA', 'DATA',
    'SELECAO', 'MULTISELECAO', 'BOOLEANO', 'TELEFONE', 'EMAIL', 'DOCUMENTO'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type origem_dado as enum ('IA', 'ATENDENTE', 'IMPORTACAO', 'INTEGRACAO', 'CONTATO');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type tipo_memoria as enum ('FATO', 'PREFERENCIA', 'OBJECAO', 'EVENTO', 'RESTRICAO');
exception when duplicate_object then null; end $bloco$;

-- ---------------------------------------------------------------------
-- Contatos
-- ---------------------------------------------------------------------
create table if not exists contatos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  -- Sempre em E.164 sem o "+": 5511999999999. A normalização é feita na
  -- aplicação (lib/nucleo/telefone.ts) antes de qualquer escrita.
  telefone text not null,
  nome text,
  nome_perfil_whatsapp text,
  email text,
  documento text,
  origem text,
  responsavel_id uuid references membros_organizacao (id) on delete set null,
  departamento_id uuid references departamentos (id) on delete set null,
  -- Resumo incremental mantido pela IA. É isso que vai no contexto, não
  -- o histórico inteiro de mensagens.
  resumo text,
  resumo_atualizado_em timestamptz,
  observacoes text,
  bloqueado boolean not null default false,
  -- Opt-out de campanha. Uma vez false, nenhuma campanha volta a incluir
  -- o contato.
  aceita_campanha boolean not null default true,
  opt_out_em timestamptz,
  opt_out_motivo text,
  eh_cliente boolean not null default false,
  ultima_interacao_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contatos_telefone_por_organizacao unique (organizacao_id, telefone)
);

create index if not exists contatos_org_idx on contatos (organizacao_id);
create index if not exists contatos_responsavel_idx on contatos (responsavel_id);
create index if not exists contatos_nome_busca_idx on contatos using gin (nome gin_trgm_ops);
create index if not exists contatos_telefone_busca_idx on contatos using gin (telefone gin_trgm_ops);
create index if not exists contatos_ultima_interacao_idx on contatos (organizacao_id, ultima_interacao_em desc nulls last);

create trigger contatos_atualizado before update on contatos
  for each row execute function marcar_atualizado_em();

-- ---------------------------------------------------------------------
-- Campos personalizados
-- ---------------------------------------------------------------------
create table if not exists campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  chave text not null,
  rotulo text not null,
  tipo tipo_campo not null default 'TEXTO',
  opcoes jsonb not null default '[]'::jsonb,
  -- Instrução em linguagem natural para a IA: como perguntar, quando
  -- perguntar, o que aceita como resposta válida.
  instrucao_ia text,
  -- Campo que a IA precisa coletar antes de qualificar o lead.
  obrigatorio_para_qualificacao boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, chave)
);

create trigger campos_personalizados_atualizado before update on campos_personalizados
  for each row execute function marcar_atualizado_em();

create table if not exists valores_campos_contato (
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  campo_id uuid not null references campos_personalizados (id) on delete cascade,
  valor text,
  origem origem_dado not null default 'IA',
  atualizado_em timestamptz not null default now(),
  primary key (contato_id, campo_id)
);

create index if not exists valores_campos_org_idx on valores_campos_contato (organizacao_id);
create index if not exists valores_campos_campo_idx on valores_campos_contato (campo_id);

-- ---------------------------------------------------------------------
-- Etiquetas
-- ---------------------------------------------------------------------
create table if not exists etiquetas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null,
  cor text not null default '#0f766e',
  descricao text,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, nome)
);

create table if not exists etiquetas_contato (
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (contato_id, etiqueta_id)
);

create index if not exists etiquetas_contato_etiqueta_idx on etiquetas_contato (etiqueta_id);

-- ---------------------------------------------------------------------
-- Memória do contato
--
-- Fatos curtos e nomeados. A chave permite sobrescrever o que mudou
-- ("banco" passou de X para Y) sem duplicar memória contraditória.
-- ---------------------------------------------------------------------
create table if not exists memorias_contato (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  tipo tipo_memoria not null default 'FATO',
  chave text not null,
  conteudo text not null,
  confianca numeric(3, 2) not null default 0.80,
  origem origem_dado not null default 'IA',
  mensagem_id uuid,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (contato_id, chave)
);

create index if not exists memorias_contato_org_idx on memorias_contato (organizacao_id, contato_id) where ativo;

create trigger memorias_contato_atualizado before update on memorias_contato
  for each row execute function marcar_atualizado_em();

-- =====================================================================
-- RLS
-- =====================================================================
alter table contatos enable row level security;
alter table campos_personalizados enable row level security;
alter table valores_campos_contato enable row level security;
alter table etiquetas enable row level security;
alter table etiquetas_contato enable row level security;
alter table memorias_contato enable row level security;

create policy "contatos: lê os da organização" on contatos
  for select using (pertence_organizacao(organizacao_id));
create policy "contatos: membro escreve" on contatos
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "campos: lê os da organização" on campos_personalizados
  for select using (pertence_organizacao(organizacao_id));
create policy "campos: gestor escreve" on campos_personalizados
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "valores: lê os da organização" on valores_campos_contato
  for select using (pertence_organizacao(organizacao_id));
create policy "valores: membro escreve" on valores_campos_contato
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "etiquetas: lê as da organização" on etiquetas
  for select using (pertence_organizacao(organizacao_id));
create policy "etiquetas: supervisor escreve" on etiquetas
  for all using (eh_supervisor_ou_acima(organizacao_id)) with check (eh_supervisor_ou_acima(organizacao_id));

create policy "etiquetas_contato: lê as da organização" on etiquetas_contato
  for select using (pertence_organizacao(organizacao_id));
create policy "etiquetas_contato: membro escreve" on etiquetas_contato
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "memorias: lê as da organização" on memorias_contato
  for select using (pertence_organizacao(organizacao_id));
create policy "memorias: membro escreve" on memorias_contato
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));
