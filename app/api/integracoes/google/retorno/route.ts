/**
 * Retorno do OAuth do Google.
 *
 * O `state` traz `<id da integração>:<valor aleatório>`. O valor aleatório
 * foi gravado na integração ao iniciar a conexão e é conferido aqui — sem
 * isso, alguém poderia forjar um retorno e ligar a própria conta Google à
 * organização de outra pessoa.
 *
 * O usuário precisa estar logado E ser gestor da organização dona da
 * integração. As duas verificações acontecem no servidor.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { trocarCodigoPorTokens } from '@/lib/integracoes/google';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { ambientePublico } from '@/lib/ambiente';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function voltarComErro(mensagem: string): NextResponse {
  const destino = new URL('/integracoes/google-sheets', ambientePublico.urlAplicacao);
  destino.searchParams.set('erro', mensagem);
  return NextResponse.redirect(destino);
}

export async function GET(requisicao: NextRequest) {
  const parametros = requisicao.nextUrl.searchParams;

  const erroGoogle = parametros.get('error');
  if (erroGoogle) {
    return voltarComErro(
      erroGoogle === 'access_denied'
        ? 'Você recusou a autorização no Google.'
        : `O Google recusou a autorização: ${erroGoogle}`,
    );
  }

  const codigo = parametros.get('code');
  const estado = parametros.get('state');

  if (!codigo || !estado) return voltarComErro('Retorno do Google veio incompleto.');

  const [integracaoId, aleatorio] = estado.split(':');
  if (!integracaoId || !aleatorio) return voltarComErro('Retorno do Google veio com estado inválido.');

  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return voltarComErro('Sua sessão expirou. Entre de novo e refaça a conexão.');

  const admin = clienteAdministrador();

  const { data: integracao } = await admin
    .from('integracoes')
    .select('id, organizacao_id, configuracao')
    .eq('id', integracaoId)
    .maybeSingle();

  if (!integracao) return voltarComErro('Integração não encontrada.');

  const configuracao =
    integracao.configuracao && typeof integracao.configuracao === 'object' && !Array.isArray(integracao.configuracao)
      ? (integracao.configuracao as Record<string, unknown>)
      : {};

  if (configuracao.estado_oauth !== aleatorio) {
    log.warn('Retorno do Google com estado divergente', { integracao: integracaoId });
    return voltarComErro('O retorno do Google não confere com o pedido. Tente conectar de novo.');
  }

  // Quem conclui precisa ser gestor da organização dona da integração.
  const { data: membro } = await admin
    .from('membros_organizacao')
    .select('papel')
    .eq('organizacao_id', integracao.organizacao_id)
    .eq('perfil_id', user.id)
    .eq('ativo', true)
    .maybeSingle();

  if (!membro || (membro.papel !== 'ADMIN' && membro.papel !== 'SUPER_ADMIN')) {
    return voltarComErro('Você não tem permissão para conectar integrações nesta organização.');
  }

  try {
    const credenciais = await trocarCodigoPorTokens(codigo);

    await admin
      .from('integracoes')
      .update({
        credenciais: credenciais as unknown as Json,
        status: 'CONECTADA',
        conta_externa: credenciais.email ?? null,
        ultimo_erro: null,
        // O valor aleatório é consumido: um retorno repetido não vale mais.
        configuracao: { estado_oauth: null } as Json,
      })
      .eq('id', integracaoId);

    await registrarAuditoria({
      organizacaoId: integracao.organizacao_id,
      acao: ACOES.INTEGRACAO_CONECTADA,
      atorPerfilId: user.id,
      atorEmail: user.email ?? null,
      entidade: 'integracoes',
      entidadeId: integracaoId,
      metadados: { conta: credenciais.email ?? null },
    });

    const destino = new URL('/integracoes/google-sheets', ambientePublico.urlAplicacao);
    destino.searchParams.set('conectado', '1');
    return NextResponse.redirect(destino);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha desconhecida';
    log.error('Falha ao concluir OAuth do Google', { erro: mensagem });

    await admin
      .from('integracoes')
      .update({ status: 'ERRO', ultimo_erro: mensagem })
      .eq('id', integracaoId);

    return voltarComErro(mensagem);
  }
}
