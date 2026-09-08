-- =====================================================================
-- 0004 — Conversas, mensagens, arquivos, notas e histórico de atribuição
--
-- Aqui mora a regra mais importante do produto: IA e humano NUNCA
-- respondem a mesma conversa ao mesmo tempo. A garantia é do banco, não
-- da aplicação — ver `assumir_conversa()` e `registrar_mensagem_ia()`
-- no fim do arquivo.
-- =====================================================================

do $bloco$ begin
  create type estado_conversa as enum (
    'IA', 'AGUARDANDO_HUMANO', 'HUMANO', 'AGUARDANDO_CLIENTE', 'ENCERRADA'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type direcao_mensagem as enum ('ENTRADA', 'SAIDA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type autor_mensagem as enum ('CONTATO', 'IA', 'ATENDENTE', 'SISTEMA');
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type tipo_mensagem as enum (
    'TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'DOCUMENTO',
    'STICKER', 'LOCALIZACAO', 'CONTATO', 'SISTEMA'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_mensagem as enum (
    'PENDENTE', 'ENFILEIRADA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU'
  );
exception when duplicate_object then null; end $bloco$;

do $bloco$ begin
  create type status_processamento as enum ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU', 'NAO_APLICAVEL');
exception when duplicate_object then null; end $bloco$;

-- ---------------------------------------------------------------------
-- Conversas
-- ---------------------------------------------------------------------
create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  canal_id uuid not null references canais (id) on delete cascade,
  estado estado_conversa not null default 'IA',
  departamento_id uuid references departamentos (id) on delete set null,
  responsavel_id uuid references membros_organizacao (id) on delete set null,
  campanha_id uuid,
  assunto text,
  prioridade int not null default 0,
  nao_lidas int not null default 0,
  -- Incrementado a cada transição de estado. A aplicação usa para
  -- concorrência otimista: quem tentar agir sobre uma versão vencida
  -- recebe erro em vez de sobrescrever a decisão de outro operador.
  versao int not null default 1,
  iniciada_em timestamptz not null default now(),
  ultima_mensagem_em timestamptz,
  ultima_mensagem_previa text,
  primeira_resposta_em timestamptz,
  primeira_resposta_humana_em timestamptz,
  encerrada_em timestamptz,
  encerrada_por uuid references membros_organizacao (id) on delete set null,
  motivo_encerramento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Uma única conversa aberta por contato e canal. É o que torna a criação
-- de conversa idempotente quando duas mensagens chegam ao mesmo tempo.
create unique index if not exists conversas_aberta_unica_idx
  on conversas (contato_id, canal_id)
  where estado <> 'ENCERRADA';

create index if not exists conversas_org_estado_idx on conversas (organizacao_id, estado, ultima_mensagem_em desc nulls last);
create index if not exists conversas_responsavel_idx on conversas (responsavel_id) where estado <> 'ENCERRADA';
create index if not exists conversas_departamento_idx on conversas (departamento_id) where estado <> 'ENCERRADA';
create index if not exists conversas_contato_idx on conversas (contato_id, iniciada_em desc);
create index if not exists conversas_campanha_idx on conversas (campanha_id) where campanha_id is not null;

create trigger conversas_atualizado before update on conversas
  for each row execute function marcar_atualizado_em();

-- ---------------------------------------------------------------------
-- Arquivos (mídia recebida e enviada)
-- ---------------------------------------------------------------------
create table if not exists arquivos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  contato_id uuid references contatos (id) on delete set null,
  caminho text,
  nome_arquivo text,
  tipo_mime text,
  tamanho_bytes bigint,
  duracao_segundos numeric,
  url_externa text,
  -- Transcrição de áudio e leitura de imagem/documento. Guardadas aqui
  -- para não reprocessar a cada volta da IA.
  transcricao text,
  status_transcricao status_processamento not null default 'NAO_APLICAVEL',
  descricao_analise text,
  status_analise status_processamento not null default 'NAO_APLICAVEL',
  erro_processamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists arquivos_org_idx on arquivos (organizacao_id, criado_em desc);

create trigger arquivos_atualizado before update on arquivos
  for each row execute function marcar_atualizado_em();

-- ---------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------
create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  conversa_id uuid not null references conversas (id) on delete cascade,
  contato_id uuid not null references contatos (id) on delete cascade,
  canal_id uuid not null references canais (id) on delete cascade,
  direcao direcao_mensagem not null,
  autor autor_mensagem not null,
  autor_membro_id uuid references membros_organizacao (id) on delete set null,
  tipo tipo_mensagem not null default 'TEXTO',
  conteudo text,
  arquivo_id uuid references arquivos (id) on delete set null,
  -- ID da mensagem no provedor. É a chave de deduplicação do webhook.
  identificador_externo text,
  -- Chave de deduplicação do ENVIO, gerada pela aplicação antes de
  -- enfileirar. Impede que um retry da fila mande a mesma mensagem duas
  -- vezes ao cliente.
  chave_idempotencia text,
  status status_mensagem not null default 'ENVIADA',
  erro text,
  respondendo_id uuid references mensagens (id) on delete set null,
  campanha_id uuid,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- Idempotência de recebimento: a mesma mensagem do provedor nunca entra
-- duas vezes, mesmo que o webhook seja reentregue.
create unique index if not exists mensagens_identificador_externo_idx
  on mensagens (organizacao_id, identificador_externo)
  where identificador_externo is not null;

-- Idempotência de envio.
create unique index if not exists mensagens_chave_idempotencia_idx
  on mensagens (organizacao_id, chave_idempotencia)
  where chave_idempotencia is not null;

create index if not exists mensagens_conversa_idx on mensagens (conversa_id, criado_em desc);
create index if not exists mensagens_org_criado_idx on mensagens (organizacao_id, criado_em desc);
create index if not exists mensagens_campanha_idx on mensagens (campanha_id) where campanha_id is not null;

-- ---------------------------------------------------------------------
-- Etiquetas na conversa, notas internas e histórico
-- ---------------------------------------------------------------------
create table if not exists etiquetas_conversa (
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  conversa_id uuid not null references conversas (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (conversa_id, etiqueta_id)
);

create table if not exists notas_internas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  conversa_id uuid not null references conversas (id) on delete cascade,
  autor_membro_id uuid references membros_organizacao (id) on delete set null,
  conteudo text not null,
  criado_em timestamptz not null default now()
);

create index if not exists notas_internas_conversa_idx on notas_internas (conversa_id, criado_em desc);

-- Todo movimento relevante da conversa vira linha aqui. É a matéria-prima
-- dos indicadores (tempo até primeira resposta, transferências) e da
-- auditoria de atendimento.
create table if not exists eventos_conversa (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes (id) on delete cascade,
  conversa_id uuid not null references conversas (id) on delete cascade,
  tipo text not null,
  estado_anterior estado_conversa,
  estado_novo estado_conversa,
  de_membro_id uuid references membros_organizacao (id) on delete set null,
  para_membro_id uuid references membros_organizacao (id) on delete set null,
  de_departamento_id uuid references departamentos (id) on delete set null,
  para_departamento_id uuid references departamentos (id) on delete set null,
  ator_membro_id uuid references membros_organizacao (id) on delete set null,
  ator autor_mensagem not null default 'SISTEMA',
  motivo text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_conversa_idx on eventos_conversa (conversa_id, criado_em desc);
create index if not exists eventos_conversa_org_idx on eventos_conversa (organizacao_id, criado_em desc);

-- =====================================================================
-- Funções de transição de estado
--
-- Toda mudança de estado passa por aqui. Nenhuma delas é "atualiza e
-- torce": todas travam a linha da conversa e conferem o estado atual
-- dentro da mesma transação.
-- =====================================================================

-- Assume a conversa para um humano. Devolve true se ESTA chamada foi a
-- que assumiu; false se alguém chegou antes. Duas abas do mesmo operador,
-- ou dois operadores no mesmo segundo, produzem exatamente um vencedor.
create or replace function assumir_conversa(
  p_conversa_id uuid,
  p_membro_id uuid,
  p_motivo text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_estado estado_conversa;
  v_org uuid;
  v_responsavel uuid;
  v_departamento uuid;
begin
  select estado, organizacao_id, responsavel_id, departamento_id
    into v_estado, v_org, v_responsavel, v_departamento
  from conversas
  where id = p_conversa_id
  for update;

  if not found then
    raise exception 'Conversa não encontrada';
  end if;

  -- Já está com um humano diferente: quem chegou antes fica com ela.
  if v_estado = 'HUMANO' and v_responsavel is not null and v_responsavel <> p_membro_id then
    return false;
  end if;

  if v_estado = 'ENCERRADA' then
    return false;
  end if;

  update conversas
  set estado = 'HUMANO',
      responsavel_id = p_membro_id,
      versao = versao + 1,
      primeira_resposta_humana_em = coalesce(primeira_resposta_humana_em, now())
  where id = p_conversa_id;

  insert into eventos_conversa (
    organizacao_id, conversa_id, tipo, estado_anterior, estado_novo,
    de_membro_id, para_membro_id, ator_membro_id, ator, motivo
  ) values (
    v_org, p_conversa_id, 'ASSUMIU', v_estado, 'HUMANO',
    v_responsavel, p_membro_id, p_membro_id, 'ATENDENTE', p_motivo
  );

  return true;
end;
$funcao$;

-- Devolve a conversa para a IA. Só um humano faz isso, e explicitamente:
-- a IA nunca retoma sozinha uma conversa que um humano assumiu.
create or replace function devolver_conversa_para_ia(
  p_conversa_id uuid,
  p_membro_id uuid,
  p_motivo text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_estado estado_conversa;
  v_org uuid;
begin
  select estado, organizacao_id into v_estado, v_org
  from conversas where id = p_conversa_id for update;

  if not found or v_estado = 'ENCERRADA' then
    return false;
  end if;

  update conversas
  set estado = 'IA', responsavel_id = null, versao = versao + 1
  where id = p_conversa_id;

  insert into eventos_conversa (
    organizacao_id, conversa_id, tipo, estado_anterior, estado_novo,
    ator_membro_id, ator, motivo
  ) values (
    v_org, p_conversa_id, 'DEVOLVIDA_PARA_IA', v_estado, 'IA',
    p_membro_id, 'ATENDENTE', p_motivo
  );

  return true;
end;
$funcao$;

-- Grava a resposta da IA. O `for update` mais a conferência do estado
-- dentro da MESMA transação são o que impede a IA de responder depois de
-- um humano ter assumido — inclusive quando o job já estava em voo.
-- Devolve o id da mensagem, ou null se a IA perdeu o direito de falar.
create or replace function registrar_mensagem_ia(
  p_conversa_id uuid,
  p_conteudo text,
  p_chave_idempotencia text,
  p_metadados jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_conversa conversas%rowtype;
  v_mensagem_id uuid;
begin
  select * into v_conversa from conversas where id = p_conversa_id for update;

  if not found then
    return null;
  end if;

  -- A IA só fala quando a conversa é dela.
  if v_conversa.estado <> 'IA' then
    return null;
  end if;

  insert into mensagens (
    organizacao_id, conversa_id, contato_id, canal_id, direcao, autor,
    tipo, conteudo, chave_idempotencia, status, metadados
  ) values (
    v_conversa.organizacao_id, v_conversa.id, v_conversa.contato_id,
    v_conversa.canal_id, 'SAIDA', 'IA', 'TEXTO', p_conteudo,
    p_chave_idempotencia, 'PENDENTE', p_metadados
  )
  on conflict (organizacao_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_mensagem_id;

  if v_mensagem_id is null then
    return null;
  end if;

  update conversas
  set estado = 'AGUARDANDO_CLIENTE',
      ultima_mensagem_em = now(),
      ultima_mensagem_previa = left(p_conteudo, 160),
      primeira_resposta_em = coalesce(primeira_resposta_em, now()),
      versao = versao + 1
  where id = p_conversa_id;

  return v_mensagem_id;
end;
$funcao$;

-- Transferência de departamento e/ou de responsável, com histórico.
create or replace function transferir_conversa(
  p_conversa_id uuid,
  p_departamento_id uuid,
  p_membro_id uuid,
  p_ator_membro_id uuid,
  p_ator autor_mensagem default 'ATENDENTE',
  p_motivo text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_conversa conversas%rowtype;
  v_novo_estado estado_conversa;
begin
  select * into v_conversa from conversas where id = p_conversa_id for update;

  if not found or v_conversa.estado = 'ENCERRADA' then
    return false;
  end if;

  -- Transferir para uma pessoa põe a conversa com humano; transferir para
  -- um departamento sem responsável a põe na fila daquele departamento.
  v_novo_estado := case when p_membro_id is not null then 'HUMANO' else 'AGUARDANDO_HUMANO' end;

  update conversas
  set departamento_id = coalesce(p_departamento_id, departamento_id),
      responsavel_id = p_membro_id,
      estado = v_novo_estado,
      versao = versao + 1
  where id = p_conversa_id;

  insert into eventos_conversa (
    organizacao_id, conversa_id, tipo, estado_anterior, estado_novo,
    de_membro_id, para_membro_id, de_departamento_id, para_departamento_id,
    ator_membro_id, ator, motivo
  ) values (
    v_conversa.organizacao_id, p_conversa_id, 'TRANSFERIDA',
    v_conversa.estado, v_novo_estado,
    v_conversa.responsavel_id, p_membro_id,
    v_conversa.departamento_id, coalesce(p_departamento_id, v_conversa.departamento_id),
    p_ator_membro_id, p_ator, p_motivo
  );

  return true;
end;
$funcao$;

create or replace function encerrar_conversa(
  p_conversa_id uuid,
  p_membro_id uuid,
  p_motivo text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_conversa conversas%rowtype;
begin
  select * into v_conversa from conversas where id = p_conversa_id for update;

  if not found or v_conversa.estado = 'ENCERRADA' then
    return false;
  end if;

  update conversas
  set estado = 'ENCERRADA', encerrada_em = now(), encerrada_por = p_membro_id,
      motivo_encerramento = p_motivo, responsavel_id = coalesce(responsavel_id, p_membro_id),
      versao = versao + 1
  where id = p_conversa_id;

  insert into eventos_conversa (
    organizacao_id, conversa_id, tipo, estado_anterior, estado_novo,
    ator_membro_id, ator, motivo
  ) values (
    v_conversa.organizacao_id, p_conversa_id, 'ENCERRADA',
    v_conversa.estado, 'ENCERRADA', p_membro_id, 'ATENDENTE', p_motivo
  );

  return true;
end;
$funcao$;

create or replace function reabrir_conversa(
  p_conversa_id uuid,
  p_membro_id uuid,
  p_para_ia boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_conversa conversas%rowtype;
  v_novo_estado estado_conversa;
  v_aberta uuid;
begin
  select * into v_conversa from conversas where id = p_conversa_id for update;

  if not found or v_conversa.estado <> 'ENCERRADA' then
    return false;
  end if;

  -- Reabrir não pode criar uma segunda conversa aberta para o mesmo
  -- contato e canal — o índice parcial recusaria, e o erro chegaria feio
  -- na tela. Melhor recusar aqui com resposta clara.
  select id into v_aberta
  from conversas
  where contato_id = v_conversa.contato_id
    and canal_id = v_conversa.canal_id
    and estado <> 'ENCERRADA'
  limit 1;

  if v_aberta is not null then
    return false;
  end if;

  v_novo_estado := case when p_para_ia then 'IA' else 'HUMANO' end;

  update conversas
  set estado = v_novo_estado,
      responsavel_id = case when p_para_ia then null else p_membro_id end,
      encerrada_em = null, encerrada_por = null, motivo_encerramento = null,
      versao = versao + 1
  where id = p_conversa_id;

  insert into eventos_conversa (
    organizacao_id, conversa_id, tipo, estado_anterior, estado_novo,
    ator_membro_id, ator
  ) values (
    v_conversa.organizacao_id, p_conversa_id, 'REABERTA',
    'ENCERRADA', v_novo_estado, p_membro_id, 'ATENDENTE'
  );

  return true;
end;
$funcao$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table arquivos enable row level security;
alter table etiquetas_conversa enable row level security;
alter table notas_internas enable row level security;
alter table eventos_conversa enable row level security;

create policy "conversas: lê as visíveis" on conversas
  for select using (pode_ver_conversa(organizacao_id, departamento_id, responsavel_id));
create policy "conversas: membro escreve" on conversas
  for update using (pode_ver_conversa(organizacao_id, departamento_id, responsavel_id))
  with check (pertence_organizacao(organizacao_id));
create policy "conversas: membro cria" on conversas
  for insert with check (pertence_organizacao(organizacao_id));

create policy "mensagens: lê as de conversa visível" on mensagens
  for select using (
    exists (
      select 1 from conversas c
      where c.id = mensagens.conversa_id
        and pode_ver_conversa(c.organizacao_id, c.departamento_id, c.responsavel_id)
    )
  );
create policy "mensagens: membro cria na organização" on mensagens
  for insert with check (pertence_organizacao(organizacao_id));
create policy "mensagens: membro atualiza na organização" on mensagens
  for update using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "arquivos: lê os da organização" on arquivos
  for select using (pertence_organizacao(organizacao_id));
create policy "arquivos: membro escreve" on arquivos
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "etiquetas_conversa: lê as da organização" on etiquetas_conversa
  for select using (pertence_organizacao(organizacao_id));
create policy "etiquetas_conversa: membro escreve" on etiquetas_conversa
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "notas: lê as da organização" on notas_internas
  for select using (pertence_organizacao(organizacao_id));
create policy "notas: membro escreve" on notas_internas
  for all using (pertence_organizacao(organizacao_id)) with check (pertence_organizacao(organizacao_id));

create policy "eventos_conversa: lê os da organização" on eventos_conversa
  for select using (pertence_organizacao(organizacao_id));
create policy "eventos_conversa: membro cria" on eventos_conversa
  for insert with check (pertence_organizacao(organizacao_id));
