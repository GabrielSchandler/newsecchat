-- =====================================================================
-- 0012 — Reservas no banco para o que não pode acontecer em dobro
--
-- Duas corridas que esta migração fecha, com o mesmo remédio de
-- `assumir_conversa()`: um UPDATE condicional que só uma chamada vence.
--
-- 1. DESPACHO DE MENSAGEM. O worker conferia "está PENDENTE?" e só depois
--    chamava o provedor. Dois trabalhos para a mesma mensagem — o normal e
--    o da varredura de recuperação — podiam ler PENDENTE juntos e mandar
--    os dois: o cliente recebia a mesma frase duas vezes.
--
-- 2. SEQUÊNCIA DE CAMPANHA. Cada passo agenda o próximo. A varredura de
--    recuperação abria uma sequência nova a cada cinco minutos sem saber
--    que a anterior seguia viva, e as sequências se somavam: depois de uma
--    hora, a campanha mandava no ritmo de doze. Disparo em rajada é
--    exatamente o que faz o WhatsApp banir o número.
--
-- Também cria o schema da Evolution API, para as tabelas dela não
-- nascerem no `public`, que a Data API expõe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema próprio da Evolution API
--
-- O Prisma dela cria as tabelas aqui (`?schema=evolution` na URL do
-- docker-compose). O `public` é exposto pela Data API à chave anônima;
-- este schema não é, e ninguém além do dono do banco recebe acesso.
-- ---------------------------------------------------------------------
create schema if not exists evolution;
revoke all on schema evolution from public;
revoke all on schema evolution from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Reserva do despacho
-- ---------------------------------------------------------------------
alter table mensagens add column if not exists despacho_reservado_ate timestamptz;

-- O worker procura mensagem de saída pendente a cada poucos segundos; sem
-- este índice parcial, cada volta leria a tabela inteira.
create index if not exists mensagens_saida_pendente_idx
  on mensagens (criado_em)
  where direcao = 'SAIDA' and status in ('PENDENTE', 'ENFILEIRADA');

-- Devolve a mensagem reservada, ou nada se ela já saiu ou se outro
-- trabalho a reservou primeiro. A reserva vence sozinha: se o worker cair
-- no meio do envio, a mensagem volta a poder sair.
create or replace function reservar_despacho_mensagem(
  p_mensagem_id uuid,
  p_organizacao_id uuid,
  p_segundos int default 120
)
returns setof mensagens
language sql
security invoker
set search_path = public
as $funcao$
  update mensagens
     set despacho_reservado_ate = now() + make_interval(secs => p_segundos)
   where id = p_mensagem_id
     and organizacao_id = p_organizacao_id
     and direcao = 'SAIDA'
     and status in ('PENDENTE', 'ENFILEIRADA')
     and (despacho_reservado_ate is null or despacho_reservado_ate < now())
  returning *;
$funcao$;

-- ---------------------------------------------------------------------
-- 2. Uma sequência por campanha
--
-- Quando é a vez do próximo passo — sempre no relógio do BANCO. O relógio
-- do worker não serve para isso: o Docker no Windows atrasa depois que a
-- máquina hiberna, às vezes em minutos.
-- ---------------------------------------------------------------------
alter table campanhas add column if not exists proximo_passo_em timestamptz;

-- Um passo só segue se for a vez dele. Quem chega antes da hora — uma
-- segunda sequência, um clique duplo em "Retomar" — perde e encerra. Quem
-- vence segura a campanha por `p_prazo_segundos` enquanto trabalha.
create or replace function reivindicar_passo_campanha(
  p_campanha_id uuid,
  p_prazo_segundos int default 300,
  p_tolerancia_segundos int default 5
)
returns boolean
language sql
security invoker
set search_path = public
as $funcao$
  with reivindicada as (
    update campanhas
       set proximo_passo_em = now() + make_interval(secs => p_prazo_segundos)
     where id = p_campanha_id
       and status = 'EM_EXECUCAO'
       and (
         proximo_passo_em is null
         or proximo_passo_em <= now() + make_interval(secs => p_tolerancia_segundos)
       )
    returning 1
  )
  select exists (select 1 from reivindicada);
$funcao$;

-- Marca quando o próximo passo pode rodar. Atraso zero devolve a vez na
-- hora — é o que o worker faz quando um passo falha, para a nova
-- tentativa da fila conseguir seguir.
create or replace function agendar_passo_campanha(
  p_campanha_id uuid,
  p_atraso_ms bigint
)
returns void
language sql
security invoker
set search_path = public
as $funcao$
  update campanhas
     set proximo_passo_em = now() + make_interval(secs => greatest(p_atraso_ms, 0) / 1000.0)
   where id = p_campanha_id;
$funcao$;

-- ---------------------------------------------------------------------
-- Só o worker chama estas funções. O Supabase concede EXECUTE a todo
-- mundo por padrão; sem a revogação, qualquer usuário logado poderia
-- segurar mensagens ou travar campanhas da própria operação.
-- ---------------------------------------------------------------------
revoke all on function reservar_despacho_mensagem(uuid, uuid, int) from public, anon, authenticated;
revoke all on function reivindicar_passo_campanha(uuid, int, int) from public, anon, authenticated;
revoke all on function agendar_passo_campanha(uuid, bigint) from public, anon, authenticated;

grant execute on function reservar_despacho_mensagem(uuid, uuid, int) to service_role;
grant execute on function reivindicar_passo_campanha(uuid, int, int) to service_role;
grant execute on function agendar_passo_campanha(uuid, bigint) to service_role;
