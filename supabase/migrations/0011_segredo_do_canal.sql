-- =====================================================================
-- 0011 — O segredo do webhook sai do alcance do navegador
--
-- Problema que esta migração fecha: a política de leitura de `canais`
-- libera a linha para qualquer membro da organização, e a linha carrega
-- `segredo_webhook`. Um atendente com o segredo em mãos conseguiria
-- forjar eventos de webhook e injetar mensagens falsas na própria
-- operação. Não é vazamento entre empresas, mas é privilégio que o papel
-- não deveria ter.
--
-- Como fecha: RLS decide QUAIS LINHAS se enxerga; privilégio de coluna
-- decide QUAIS COLUNAS. Como um GRANT de tabela vale para todas as
-- colunas, o caminho é revogar o da tabela e conceder coluna a coluna,
-- deixando `segredo_webhook` de fora.
--
-- Quem precisa do segredo:
--   - o webhook, para achar o canal  -> usa a chave de serviço;
--   - a tela de canais, para mostrar a URL ao gestor -> usa a função
--     `url_webhook_do_canal()` abaixo, que confere o papel.
-- =====================================================================

-- A view não chegou a ser usada em lugar nenhum: o controle por coluna
-- resolve melhor e sem uma segunda entidade para manter em sincronia.
drop view if exists canais_visiveis;

revoke select on canais from authenticated;
revoke select on canais from anon;

grant select (
  id,
  organizacao_id,
  nome,
  tipo,
  provedor,
  departamento_id,
  telefone,
  identificador_externo,
  configuracao,
  status,
  ia_ativa,
  ultima_conexao_em,
  ultimo_erro,
  ativo,
  criado_em,
  atualizado_em
) on canais to authenticated;

-- Devolve a URL completa do webhook, só para gestor da organização dona
-- do canal. SECURITY DEFINER para conseguir ler a coluna revogada acima.
create or replace function url_webhook_do_canal(p_canal_id uuid, p_base text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $funcao$
declare
  v_canal canais%rowtype;
begin
  select * into v_canal from canais where id = p_canal_id;

  if not found then
    raise exception 'Canal não encontrado';
  end if;

  if not eh_gestor(v_canal.organizacao_id) then
    raise exception 'Sem permissão para ver o endereço do webhook';
  end if;

  return rtrim(p_base, '/') || '/api/webhooks/evolution/' || v_canal.segredo_webhook;
end;
$funcao$;

-- Gera um segredo novo. Usado quando o gestor suspeita que a URL vazou.
create or replace function girar_segredo_webhook(p_canal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_organizacao uuid;
  v_novo text;
begin
  select organizacao_id into v_organizacao from canais where id = p_canal_id;

  if v_organizacao is null then
    raise exception 'Canal não encontrado';
  end if;

  if not eh_gestor(v_organizacao) then
    raise exception 'Sem permissão para trocar o segredo do webhook';
  end if;

  v_novo := encode(gen_random_bytes(24), 'hex');

  update canais set segredo_webhook = v_novo where id = p_canal_id;

  insert into registros_auditoria (organizacao_id, ator_perfil_id, acao, entidade, entidade_id)
  values (v_organizacao, auth.uid(), 'CANAL_ATUALIZADO', 'canais', p_canal_id::text);

  return v_novo;
end;
$funcao$;
