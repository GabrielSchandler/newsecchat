-- Fila leve e contagens do atendimento por escopo.
--
-- 1) Índices para a view `fila_operacional`.
--
-- A view descobre "a última mensagem pública", "o último envio humano" e
-- "a última mensagem do cliente" de cada conversa aberta ordenando por
-- coalesce(enviado_em, criado_em). Sem índice nessa expressão, o banco lia
-- TODAS as mensagens de cada conversa aberta e, em cada uma, avaliava a
-- política de leitura de `mensagens` (pode_ver_conversa, duas vezes). Medido
-- num banco local com 1.200 conversas abertas e 168 mil mensagens, como
-- usuário SUPER_ADMIN: a lista levava ~17 s, a contagem exata ~4,5 s e
-- fila_contagens ~6 s — por renderização da tela. Com estes índices, a
-- mesma carga cai para ~1,5 s, ~0,25 s e ~0,8 s. A regra da view não muda.
--
-- Índices parciais de propósito: cada um casa com o filtro exato de uma das
-- subconsultas da view, então o banco anda no índice, para na primeira
-- linha que serve e não precisa ler nem checar o resto da conversa.
create index if not exists mensagens_cronologia_idx
  on mensagens (conversa_id, (coalesce(enviado_em, criado_em)) desc, id desc)
  where tipo <> 'SISTEMA';

create index if not exists mensagens_atendente_idx
  on mensagens (conversa_id, (coalesce(enviado_em, criado_em)) desc, id desc)
  where autor = 'ATENDENTE';

create index if not exists mensagens_contato_cronologia_idx
  on mensagens (conversa_id, (coalesce(enviado_em, criado_em)) desc, id desc)
  where autor = 'CONTATO';

-- Mensagens do cliente ainda sem resposta humana (início da espera).
create index if not exists mensagens_contato_idx
  on mensagens (conversa_id, criado_em)
  where autor = 'CONTATO';

-- Contagem de falhas de envio e verificação de envio incerto por conversa.
create index if not exists mensagens_falhas_idx
  on mensagens (conversa_id)
  where status = 'FALHOU';

create index if not exists mensagens_despacho_idx
  on mensagens (conversa_id)
  where despacho_incerto or status = 'ENFILEIRADA';

-- 2) Contagens da tela de Atendimento, por escopo e por filtro, numa só
-- leitura da fila.
--
--   meu     conversas com atendimento humano cujo responsável é p_membro
--   equipe  todo atendimento humano visível (com ou sem responsável)
--   ia      conversas que a IA está atendendo
--
-- Dentro de cada escopo humano, os filtros são fatias que não se
-- sobrepõem, então "novos" + "nao_respondidos" nunca passa de "todos":
--
--   novos            o cliente escreveu e ninguém abriu a conversa ainda
--                    (nao_lidas > 0 — o contador zera quando alguém abre)
--   nao_respondidos  já foi aberta, mas o cliente segue esperando uma
--                    resposta humana (mesma regra `para_responder` da fila:
--                    mensagem automática, nota interna e leitura não
--                    encerram a espera)
--
-- security invoker: a função enxerga só o que o usuário que chamou enxerga,
-- as mesmas linhas da lista.
create or replace function atendimento_contagens(
  p_membro uuid,
  p_busca text default '',
  p_equipe uuid default null,
  p_canal uuid default null
)
returns jsonb language sql stable security invoker set search_path = public as $$
  with f as (
    select estado, responsavel_id, nao_lidas, para_responder, falha_ia
    from fila_operacional
    where estado <> 'ENCERRADA'
      and (p_busca = ''
        or contato_nome ilike '%' || p_busca || '%'
        or contato_telefone like '%' || regexp_replace(p_busca, '[^0-9]', '', 'g') || '%'
           and length(regexp_replace(p_busca, '[^0-9]', '', 'g')) >= 3)
      and (p_equipe is null or departamento_id = p_equipe)
      and (p_canal is null or canal_id = p_canal)
  )
  select jsonb_build_object(
    'meu', jsonb_build_object(
      'novos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO') and responsavel_id = p_membro and nao_lidas > 0),
      'nao_respondidos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO') and responsavel_id = p_membro and nao_lidas = 0 and para_responder),
      'todos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO') and responsavel_id = p_membro)
    ),
    'equipe', jsonb_build_object(
      'novos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO') and nao_lidas > 0),
      'nao_respondidos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO') and nao_lidas = 0 and para_responder),
      'todos', count(*) filter (where estado in ('HUMANO', 'AGUARDANDO_HUMANO'))
    ),
    'ia', jsonb_build_object(
      'todos', count(*) filter (where estado in ('IA', 'AGUARDANDO_CLIENTE')),
      'falhas', count(*) filter (where estado in ('IA', 'AGUARDANDO_CLIENTE') and falha_ia)
    )
  )
  from f;
$$;
