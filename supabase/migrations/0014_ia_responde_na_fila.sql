-- =====================================================================
-- 0014 — IA continua respondendo enquanto aguarda um humano, e primeira
--        mensagem fixa.
--
-- Achado em produção (16/09/2026): a IA dizia "vou chamar um
-- especialista" e SUMIA. `encaminharParaHumano` move a conversa pra
-- AGUARDANDO_HUMANO na hora — e dali em diante `registrar_mensagem_ia`
-- recusava gravar qualquer resposta (`estado <> 'IA'`) e o worker nem
-- enfileirava o turno (`estadoDepois === 'IA'`, em evento-webhook.ts).
-- Resultado: cliente respondia a uma pergunta que a própria IA tinha
-- acabado de fazer, e ninguém — nem IA, nem humano ainda — lia. Ver o
-- caso real da conversa do Ronaldo em `_memoria/estrategia.md`.
--
-- A garantia que não pode quebrar (`_memoria/empresa.md`, e o comentário
-- no topo de 0004_conversas_mensagens.sql): IA e humano nunca respondem
-- ao mesmo tempo. Ela continua de pé aqui — quem tranca é o mesmo
-- `for update` de sempre: se `assumir_conversa()` pegar a linha primeiro,
-- o estado já é 'HUMANO' quando `registrar_mensagem_ia` tentar escrever,
-- e a IA perde a corrida como sempre perdeu.
-- =====================================================================

alter table versoes_agente_ia
  add column if not exists primeira_mensagem text not null default '';

comment on column versoes_agente_ia.primeira_mensagem is
  'Texto fixo da primeira resposta da conversa — enviado sem chamar o modelo, como um bot de saudação. Em branco, a primeira resposta também é gerada pela IA normalmente.';

create or replace function registrar_mensagem_ia(
  p_conversa_id uuid,
  p_conteudo text,
  p_chave_idempotencia text,
  p_metadados jsonb default '{}'::jsonb,
  p_remetente_nome text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $funcao$
declare
  v_conversa conversas%rowtype;
  v_mensagem_id uuid;
  v_novo_estado estado_conversa;
begin
  select * into v_conversa from conversas where id = p_conversa_id for update;

  if not found then
    return null;
  end if;

  -- A IA fala quando a conversa é dela OU quando está na fila de um
  -- humano que ainda não assumiu. Nunca depois de 'HUMANO'.
  if v_conversa.estado not in ('IA', 'AGUARDANDO_HUMANO') then
    return null;
  end if;

  insert into mensagens (
    organizacao_id, conversa_id, contato_id, canal_id, direcao, autor,
    tipo, conteudo, chave_idempotencia, status, metadados, remetente_nome
  ) values (
    v_conversa.organizacao_id, v_conversa.id, v_conversa.contato_id,
    v_conversa.canal_id, 'SAIDA', 'IA', 'TEXTO', p_conteudo,
    p_chave_idempotencia, 'PENDENTE', p_metadados, p_remetente_nome
  )
  on conflict (organizacao_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_mensagem_id;

  if v_mensagem_id is null then
    return null;
  end if;

  -- Já estava na fila de um humano: continua lá — senão a conversa some
  -- da fila sem ninguém ter assumido de verdade. Só quando ainda era da
  -- IA (fluxo normal) é que vira "aguardando cliente".
  v_novo_estado := case
    when v_conversa.estado = 'AGUARDANDO_HUMANO' then 'AGUARDANDO_HUMANO'
    else 'AGUARDANDO_CLIENTE'
  end;

  update conversas
  set estado = v_novo_estado,
      ultima_mensagem_em = now(),
      ultima_mensagem_previa = left(p_conteudo, 160),
      primeira_resposta_em = coalesce(primeira_resposta_em, now()),
      versao = versao + 1
  where id = p_conversa_id;

  return v_mensagem_id;
end;
$funcao$;
