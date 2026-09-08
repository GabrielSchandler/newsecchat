-- =====================================================================
-- 0005 — Configuração da IA, versionamento de prompt, análise de
--        atendimentos e sugestões de melhoria.
--
-- Regra crítica do produto: a IA NÃO altera o próprio prompt. Ela gera
-- sugestão; um humano aprova; nasce uma versão nova; a versão é
-- publicada. O que roda em produção é sempre uma versão PUBLICADA com
-- nome de quem aprovou.
-- =====================================================================

do $bloco$ begin
  create type tipo_agente as enum ('SDR', 'TRIAGEM', 'SUPORTE', 'JURIDICO', 'ADMINISTRATIVO', 'GENERICO');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_versao_ia as enum ('RASCUNHO', 'EM_REVISAO', 'PUBLICADA', 'ARQUIVADA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type origem_versao_ia as enum ('HUMANO', 'SUGESTAO_IA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_execucao as enum ('PENDENTE', 'EXECUTANDO', 'CONCLUIDA', 'FALHOU');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_sugestao as enum ('PENDENTE', 'APROVADA', 'REJEITADA', 'APLICADA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type tipo_sugestao as enum (
    'INSTRUCAO', 'BASE_CONHECIMENTO', 'PERGUNTA', 'CAMPO', 'TRANSFERENCIA', 'OBJECAO'
  );
exception when duplicate_object then null; end $bloco$;

-- ---------------------------------------------------------------------
-- Agentes de IA da organização
-- ---------------------------------------------------------------------
create table if not exists agentes_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null,
  tipo tipo_agente not null default 'SDR',
  descricao text,
  ativo boolean not null default true,
  -- Agente que atende quem chega sem departamento definido.
  padrao boolean not null default false,
  provedor text not null default 'OPENAI',
  modelo text not null default 'gpt-4o-mini',
  temperatura numeric(3, 2) not null default 0.40,
  -- Teto de mensagens que a IA manda seguidas sem resposta do cliente.
  -- Evita a IA falando sozinha quando o cliente some.
  max_mensagens_seguidas int not null default 2,
  versao_publicada_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists agentes_ia_padrao_idx
  on agentes_ia (organizacao_id) where padrao;

create trigger agentes_ia_atualizado before update on agentes_ia
  for each row execute function marcar_atualizado_em();

-- ---------------------------------------------------------------------
-- Versões de configuração — o prompt propriamente dito
-- ---------------------------------------------------------------------
create table if not exists versoes_agente_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  agente_id uuid not null references agentes_ia (id) on delete cascade,
  versao int not null,
  status status_versao_ia not null default 'RASCUNHO',
  origem origem_versao_ia not null default 'HUMANO',

  persona text not null default '',
  tom text not null default '',
  descricao_empresa text not null default '',
  servicos text not null default '',
  base_conhecimento text not null default '',
  objetivos text not null default '',
  regras text not null default '',
  limitacoes text not null default '',
  informacoes_proibidas text not null default '',
  mensagem_fallback text not null default 'Vou chamar um atendente para te ajudar com isso.',
  -- Perguntas que a IA precisa cobrir ao longo da conversa. Não é
  -- formulário: a ordem é sugestão, e o que o cliente já respondeu não
  -- se pergunta de novo.
  perguntas jsonb not null default '[]'::jsonb,
  -- Chaves de `campos_personalizados` que precisam estar preenchidas
  -- para o lead contar como qualificado.
  campos_obrigatorios jsonb not null default '[]'::jsonb,
  criterios_transferencia jsonb not null default '[]'::jsonb,
  -- { "fuso": "America/Sao_Paulo", "dias": {"1": ["08:00","18:00"], ...},
  --   "fora_do_horario": "texto" }
  horarios jsonb not null default '{}'::jsonb,

  notas_da_versao text,
  criado_por uuid references membros_organizacao (id) on delete set null,
  aprovado_por uuid references membros_organizacao (id) on delete set null,
  aprovado_em timestamptz,
  publicado_em timestamptz,
  substitui_versao_id uuid references versoes_agente_ia (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (agente_id, versao)
);

create index if not exists versoes_agente_status_idx on versoes_agente_ia (agente_id, status);

create trigger versoes_agente_ia_atualizado before update on versoes_agente_ia
  for each row execute function marcar_atualizado_em();

alter table agentes_ia
  drop constraint if exists agentes_ia_versao_publicada_fk;
alter table agentes_ia
  add constraint agentes_ia_versao_publicada_fk
  foreign key (versao_publicada_id) references versoes_agente_ia (id) on delete set null;

-- Publicar uma versão: arquiva a anterior, marca a nova e aponta o
-- agente para ela. Tudo numa transação — nunca existe janela com duas
-- versões publicadas nem com nenhuma.
create or replace function publicar_versao_ia(
  p_versao_id uuid,
  p_membro_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_versao versoes_agente_ia%rowtype;
begin
  select * into v_versao from versoes_agente_ia where id = p_versao_id for update;

  if not found then
    raise exception 'Versão não encontrada';
  end if;

  if v_versao.status = 'PUBLICADA' then
    return false;
  end if;

  update versoes_agente_ia
  set status = 'ARQUIVADA'
  where agente_id = v_versao.agente_id and status = 'PUBLICADA';

  update versoes_agente_ia
  set status = 'PUBLICADA',
      aprovado_por = p_membro_id,
      aprovado_em = coalesce(aprovado_em, now()),
      publicado_em = now()
  where id = p_versao_id;

  update agentes_ia
  set versao_publicada_id = p_versao_id
  where id = v_versao.agente_id;

  return true;
end;
$funcao$;

-- Próximo número de versão do agente, sem corrida entre dois rascunhos
-- criados ao mesmo tempo.
create or replace function proxima_versao_agente(p_agente_id uuid)
returns int
language sql
stable
security invoker
set search_path = public
as $funcao$
  select coalesce(max(versao), 0) + 1 from versoes_agente_ia where agente_id = p_agente_id;
$funcao$;

-- ---------------------------------------------------------------------
-- Registro de cada chamada à IA — custo, latência e falha
-- ---------------------------------------------------------------------
create table if not exists interacoes_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  conversa_id uuid references conversas (id) on delete cascade,
  mensagem_id uuid references mensagens (id) on delete set null,
  agente_id uuid references agentes_ia (id) on delete set null,
  versao_id uuid references versoes_agente_ia (id) on delete set null,
  finalidade text not null default 'RESPOSTA',
  provedor text not null,
  modelo text not null,
  tokens_entrada int,
  tokens_saida int,
  latencia_ms int,
  sucesso boolean not null default true,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists interacoes_ia_org_idx on interacoes_ia (organizacao_id, criado_em desc);
create index if not exists interacoes_ia_conversa_idx on interacoes_ia (conversa_id, criado_em desc);

-- ---------------------------------------------------------------------
-- Análise de atendimentos e sugestões
-- ---------------------------------------------------------------------
create table if not exists execucoes_analise_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  agente_id uuid references agentes_ia (id) on delete set null,
  status status_execucao not null default 'PENDENTE',
  periodo_inicio timestamptz not null,
  periodo_fim timestamptz not null,
  total_conversas int not null default 0,
  total_mensagens int not null default 0,
  resumo text,
  relatorio jsonb not null default '{}'::jsonb,
  erro text,
  iniciado_por uuid references membros_organizacao (id) on delete set null,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists execucoes_analise_org_idx on execucoes_analise_ia (organizacao_id, iniciado_em desc);

create table if not exists sugestoes_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  execucao_id uuid references execucoes_analise_ia (id) on delete cascade,
  agente_id uuid references agentes_ia (id) on delete set null,
  tipo tipo_sugestao not null,
  titulo text not null,
  descricao text not null,
  -- Conversas/trechos que sustentam a sugestão. Sem isso vira palpite.
  evidencias jsonb not null default '[]'::jsonb,
  ocorrencias int not null default 0,
  -- { "campo": "base_conhecimento", "texto_novo": "..." }
  alteracao_proposta jsonb not null default '{}'::jsonb,
  status status_sugestao not null default 'PENDENTE',
  revisado_por uuid references membros_organizacao (id) on delete set null,
  revisado_em timestamptz,
  observacao_revisao text,
  versao_gerada_id uuid references versoes_agente_ia (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists sugestoes_ia_org_idx on sugestoes_ia (organizacao_id, status, criado_em desc);

-- =====================================================================
-- RLS
-- =====================================================================
alter table agentes_ia enable row level security;
alter table versoes_agente_ia enable row level security;
alter table interacoes_ia enable row level security;
alter table execucoes_analise_ia enable row level security;
alter table sugestoes_ia enable row level security;

create policy "agentes: lê os da organização" on agentes_ia
  for select using (pertence_organizacao(organizacao_id));
create policy "agentes: gestor escreve" on agentes_ia
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "versoes ia: lê as da organização" on versoes_agente_ia
  for select using (pertence_organizacao(organizacao_id));
create policy "versoes ia: gestor escreve" on versoes_agente_ia
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "interacoes ia: supervisor lê" on interacoes_ia
  for select using (eh_supervisor_ou_acima(organizacao_id));

create policy "analises: supervisor lê" on execucoes_analise_ia
  for select using (eh_supervisor_ou_acima(organizacao_id));
create policy "analises: gestor escreve" on execucoes_analise_ia
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));

create policy "sugestoes: supervisor lê" on sugestoes_ia
  for select using (eh_supervisor_ou_acima(organizacao_id));
create policy "sugestoes: gestor escreve" on sugestoes_ia
  for all using (eh_gestor(organizacao_id)) with check (eh_gestor(organizacao_id));
