/**
 * Webhook da Evolution API.
 *
 * O que este endpoint faz — e só isto:
 *   autentica → identifica o canal → deduplica → grava → enfileira → responde.
 *
 * Nada de processar mensagem, chamar IA ou baixar mídia aqui dentro. O
 * provedor tem tempo limite curto e reentrega o que demora; trabalho
 * pesado na resposta do webhook vira tempestade de reentrega.
 *
 * Autenticação: a Evolution não assina a carga, então o segredo vai no
 * PRÓPRIO CAMINHO da URL, e é o segredo do canal (coluna
 * `segredo_webhook`, que nunca chega ao navegador). Quem não tem a URL
 * completa não consegue injetar mensagem em nome de ninguém, e o segredo
 * identifica o canal ao mesmo tempo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import { enfileirarTolerante } from '@/lib/filas/produtor';
import { FILAS } from '@/lib/filas/nomes';
import { chaveEventoWebhook } from '@/lib/nucleo/idempotencia';
import { conferirLimite } from '@/lib/nucleo/limitador';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODIGO_DUPLICADO = '23505';

/** Teto por canal. Uma instância saudável fica muito abaixo disso. */
const LIMITE_EVENTOS = 600;
const JANELA_MS = 60_000;

export async function POST(
  requisicao: NextRequest,
  contexto: { params: Promise<{ segredo: string }> },
) {
  const { segredo } = await contexto.params;

  if (!segredo || segredo.length < 16) {
    return NextResponse.json({ ok: false, erro: 'Endereço inválido' }, { status: 404 });
  }

  let carga: unknown;
  try {
    carga = await requisicao.json();
  } catch {
    return NextResponse.json({ ok: false, erro: 'Corpo não é JSON' }, { status: 400 });
  }

  const supabase = clienteAdministrador();

  const { data: canal, error: erroCanal } = await supabase
    .from('canais')
    .select('id, organizacao_id, identificador_externo, provedor, ativo')
    .eq('segredo_webhook', segredo)
    .maybeSingle();

  if (erroCanal) {
    log.error('Falha ao resolver o canal do webhook', { erro: erroCanal.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!canal) {
    // 404 sem detalhe: um segredo errado não deve render pista nenhuma.
    log.warn('Webhook recebido com segredo desconhecido');
    return NextResponse.json({ ok: false, erro: 'Endereço inválido' }, { status: 404 });
  }

  const limite = conferirLimite(`webhook:${canal.id}`, LIMITE_EVENTOS, JANELA_MS);
  if (!limite.permitido) {
    log.warn('Limite de eventos do webhook atingido', {
      organizacao_id: canal.organizacao_id,
      canal_id: canal.id,
    });
    return NextResponse.json(
      { ok: false, erro: 'Muitos eventos' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limite.reiniciaEmMs / 1000)) } },
    );
  }

  const registro = log.comContexto({
    organizacao_id: canal.organizacao_id,
    canal_id: canal.id,
    provedor: canal.provedor,
  });

  const provedor = obterProvedorMensageria(canal.provedor);
  const evento = provedor.interpretarEvento(carga);

  // A instância na carga precisa bater com a do canal. Sem esta conferência,
  // um segredo vazado de um canal poderia injetar evento de outro.
  if (evento.instancia && evento.instancia !== canal.identificador_externo) {
    registro.warn('Instância da carga não corresponde ao canal do segredo', {
      instancia_recebida: evento.instancia,
    });
    return NextResponse.json({ ok: false, erro: 'Instância divergente' }, { status: 400 });
  }

  if (!canal.ativo) {
    registro.info('Evento recebido para canal desativado; ignorado');
    return NextResponse.json({ ok: true, ignorado: 'canal desativado' });
  }

  const identificador = chaveEventoWebhook(
    canal.provedor,
    canal.identificador_externo,
    evento.identificadorEvento,
  );

  const { data: gravado, error: erroGravacao } = await supabase
    .from('eventos_webhook')
    .insert({
      organizacao_id: canal.organizacao_id,
      canal_id: canal.id,
      provedor: canal.provedor,
      tipo_evento: evento.tipo,
      identificador_externo: identificador,
      instancia: canal.identificador_externo,
      carga: carga as Json,
      status: evento.tipo === 'IGNORADO' ? 'IGNORADO' : 'RECEBIDO',
    })
    .select('id')
    .single();

  if (erroGravacao) {
    if (erroGravacao.code === CODIGO_DUPLICADO) {
      // Reentrega do provedor. Responder 200 é o certo: repetir a recusa
      // só faria a Evolution insistir.
      registro.info('Evento repetido; já havia sido recebido', { evento: evento.tipo });
      return NextResponse.json({ ok: true, duplicado: true });
    }

    registro.error('Falha ao gravar o evento do webhook', { erro: erroGravacao.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (evento.tipo === 'IGNORADO') {
    registro.debug('Evento sem interesse para a aplicação', { motivo: evento.motivo });
    return NextResponse.json({ ok: true, ignorado: evento.motivo });
  }

  const enfileirado = await enfileirarTolerante(
    FILAS.eventosWebhook,
    { eventoId: gravado.id },
    { id: `evento:${gravado.id}` },
  );

  if (enfileirado) {
    await supabase
      .from('eventos_webhook')
      .update({ status: 'ENFILEIRADO' })
      .eq('id', gravado.id);
  }

  registro.info('Evento recebido', { evento: evento.tipo, enfileirado });

  return NextResponse.json({ ok: true });
}

/** GET serve só para o dono conferir que a URL está correta. */
export async function GET(
  _requisicao: NextRequest,
  contexto: { params: Promise<{ segredo: string }> },
) {
  const { segredo } = await contexto.params;

  const { data: canal } = await clienteAdministrador()
    .from('canais')
    .select('nome')
    .eq('segredo_webhook', segredo)
    .maybeSingle();

  if (!canal) {
    return NextResponse.json({ ok: false, erro: 'Endereço inválido' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    mensagem: `Webhook ativo para o canal "${canal.nome}". Configure este mesmo endereço na Evolution API.`,
  });
}
