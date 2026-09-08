-- =====================================================================
-- 0006 — Campanhas e repique de leads antigos
--
-- Campanha não é laço disparando mensagem: é uma lista de destinatários
-- que um worker consome um a um, respeitando janela de envio, intervalo e
-- opt-out. Cada destinatário é reservado com FOR UPDATE SKIP LOCKED, então
-- dois workers na mesma campanha nunca mandam a mesma mensagem duas vezes.
-- =====================================================================

do $bloco$ begin
  create type status_campanha as enum (
    'RASCUNHO', 'AGENDADA', 'EM_EXECUCAO', 'PAUSADA', 'CONCLUIDA', 'CANCELADA'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_contato_campanha as enum (
    'PENDENTE', 'RESERVADO', 'ENVIADO', 'FALHOU', 'IGNORADO', 'RESPONDIDO'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type origem_contatos_campanha as enum ('MANUAL', 'ETIQUETA', 'FILTRO', 'GOOGLE_SHEETS');
exception when duplicate_object then null; end $bloco$;

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  nome text not null,
  descricao text,
  canal_id uuid not null references canais (id) on delete restrict,
  origem_contatos origem_contatos_campanha not null default 'MANUAL',
  filtro jsonb not null default '{}'::jsonb,

  -- Corpo da mensagem com variáveis: {{nome}}, {{primeiro_nome}} e as
  -- chaves de campos personalizados da organização.
  mensagem text not null,
  -- Variações para personalização e teste A/B. NÃO existem para escapar
  -- de detecção de spam; existem para medir qual texto converte.
  variacoes jsonb not null default '[]'::jsonb,

  intervalo_minimo_segundos int not null default 45,
  intervalo_maximo_segundos int not null default 90,
  janela_inicio time not null default '09:00',
  janela_fim time not null default '18:00',
  -- 1 = segunda ... 7 = domingo (ISO).
  dias_semana int[] not null default array[1, 2, 3, 4, 5],
  limite_diario int not null default 200,

  -- IA assume a resposta de quem responder a campanha (repique).
  ia_assume_resposta boolean not null default true,
  departamento_id uuid references departamentos (id) on delete set null,

  status status_campanha not null default 'RASCUNHO',
  agendada_para timestamptz,
  iniciada_em timestamptz,
  concluida_em timestamptz,

  total int not null default 0,
  processados int not null default 0,
  enviados int not null default 0,
  falhas int not null default 0,
  ignorados int not null default 0,
  respondidos int not null default 0,

  criado_por uuid references membros_organizacao (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint campanhas_intervalo_coerente check (intervalo_maximo_segundos >= intervalo_minimo_segundos),
  constraint campanhas_intervalo_minimo check (intervalo_minimo_segundos >= 5)
);

create index if not exists campanhas_org_idx on campanhas (organizacao_id, status, criado_em desc);
create index if not exists campanhas_execucao_idx on campanhas (status) where status = 'EM_EXECUCAO';

create trigger campanhas_atualizado before update on campanhas
  for each row execute function marcar_atualizado_em();

create table if not exists contatos_campanha (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  campanha_id uuid not null references campanhas (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  status status_contato_campanha not null default 'PENDENTE',
  mensagem_id uuid references mensagens (id) on delete set null,
  conversa_id uuid references conversas (id) on delete set null,
  variacao_usada int,
  tentativas int not null default 0,
  erro text,
  motivo_ignorado text,
  reservado_em timestamptz,
  enviado_em timestamptz,
  respondido_em timestamptz,
  criado_em timestamptz not null default now(),
  -- Um contato entra uma vez por campanha. Reimportar a mesma lista não
  -- duplica envio.
  unique (campanha_id, contato_id)
);

create index if not exists contatos_campanha_fila_idx
  on contatos_campanha (campanha_id, status) where status = 'PENDENTE';
create index if not exists contatos_campanha_contato_idx on contatos_campanha (contato_id, criado_em desc);

-- Reserva o próximo destinatário pendente da campanha e já o marca como
-- RESERVADO. SKIP LOCKED faz dois workers pegarem linhas diferentes em vez
-- de esperarem um pelo outro.
create or replace function reservar_contato_campanha(p_campanha_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_id uuid;
begin
  select cc.id into v_id
  from contatos_campanha cc
  where cc.campanha_id = p_campanha_id and cc.status = 'PENDENTE'
  order by cc.criado_em
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update contatos_campanha
  set status = 'RESERVADO', reservado_em = now(), tentativas = tentativas + 1
  where id = v_id;

  return v_id;
end;
$funcao$;

-- Contabiliza o resultado de um destinatário e fecha a campanha quando
-- não sobra ninguém pendente.
create or replace function concluir_contato_campanha(
  p_contato_campanha_id uuid,
  p_status status_contato_campanha,
  p_mensagem_id uuid default null,
  p_conversa_id uuid default null,
  p_erro text default null,
  p_motivo_ignorado text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_campanha_id uuid;
  v_restantes int;
begin
  update contatos_campanha
  set status = p_status,
      mensagem_id = coalesce(p_mensagem_id, mensagem_id),
      conversa_id = coalesce(p_conversa_id, conversa_id),
      erro = p_erro,
      motivo_ignorado = p_motivo_ignorado,
      enviado_em = case when p_status = 'ENVIADO' then now() else enviado_em end
  where id = p_contato_campanha_id
  returning campanha_id into v_campanha_id;

  if v_campanha_id is null then
    return;
  end if;

  update campanhas
  set processados = processados + 1,
      enviados = enviados + case when p_status = 'ENVIADO' then 1 else 0 end,
      falhas = falhas + case when p_status = 'FALHOU' then 1 else 0 end,
      ignorados = ignorados + case when p_status = 'IGNORADO' then 1 else 0 end
  where id = v_campanha_id;

  select count(*) into v_restantes
  from contatos_campanha
  where campanha_id = v_campanha_id and status in ('PENDENTE', 'RESERVADO');

  if v_restantes = 0 then
    update campanhas
    set status = 'CONCLUIDA', concluida_em = now()
    where id = v_campanha_id and status = 'EM_EXECUCAO';
  end if;
end;
$funcao$;

-- Marca o lead como recuperado quando ele responde a campanha. Chamada
-- pelo processamento de mensagem recebida.
create or replace function registrar_resposta_campanha(
  p_conversa_id uuid,
  p_contato_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_registro record;
begin
  select cc.id, cc.campanha_id into v_registro
  from contatos_campanha cc
  where cc.contato_id = p_contato_id
    and cc.status = 'ENVIADO'
    and cc.respondido_em is null
    and cc.enviado_em > now() - interval '30 days'
  order by cc.enviado_em desc
  limit 1;

  if v_registro.id is null then
    return;
  end if;

  update contatos_campanha
  set status = 'RESPONDIDO', respondido_em = now(), conversa_id = p_conversa_id
  where id = v_registro.id;

  update campanhas set respondidos = respondidos + 1 where id = v_registro.campanha_id;

  -- A conversa passa a carregar de onde o lead veio. É isso que responde
  -- "qual campanha recuperou este lead".
  update conversas set campanha_id = v_registro.campanha_id
  where id = p_conversa_id and campanha_id is null;
end;
$funcao$;

alter table campanhas enable row level security;
alter table contatos_campanha enable row level security;

create policy "campanhas: lê as da organização" on campanhas
  for select using (pertence_organizacao(organizacao_id));
create policy "campanhas: supervisor escreve" on campanhas
  for all using (eh_supervisor_ou_acima(organizacao_id)) with check (eh_supervisor_ou_acima(organizacao_id));

create policy "contatos_campanha: lê os da organização" on contatos_campanha
  for select using (pertence_organizacao(organizacao_id));
create policy "contatos_campanha: supervisor escreve" on contatos_campanha
  for all using (eh_supervisor_ou_acima(organizacao_id)) with check (eh_supervisor_ou_acima(organizacao_id));
