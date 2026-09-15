-- =====================================================================
-- Nome de quem assina cada mensagem enviada.
--
-- Toda mensagem de saída passa a carregar, gravado no momento do envio,
-- o nome de quem está "falando": o nome de exibição da IA (configurado
-- pela empresa) ou o nome do atendente humano que respondeu. É esse nome
-- que abre a mensagem no WhatsApp, em negrito — ver
-- `lib/servicos/envio.ts`, `formatarParaEnvio`.
--
-- Fica gravado na mensagem, não recalculado na hora do despacho: se a
-- empresa renomear a IA de "Ana" para "Beatriz" amanhã, a mensagem de
-- hoje continua dizendo "Ana", porque foi ela quem respondeu.
-- =====================================================================

alter table mensagens add column if not exists remetente_nome text;

-- Nome de exibição da IA para o cliente. Diferente de `agentes_ia.nome`,
-- que é o rótulo administrativo do agente na tela de configuração (ex.:
-- "Atendimento inicial") e nunca chega ao WhatsApp.
alter table versoes_agente_ia add column if not exists nome_exibicao text;

-- registrar_mensagem_ia ganha o nome de exibição como parâmetro, com
-- default null: chamada antiga (sem o parâmetro) continua funcionando,
-- só sem o prefixo no envio.
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
