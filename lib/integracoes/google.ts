/**
 * Integração com o Google (Sheets).
 *
 * Usa OAuth 2.0 com refresh token guardado em `integracoes.credenciais` —
 * coluna que só o servidor lê, e que a view `integracoes_visiveis` exclui
 * para nunca chegar ao navegador.
 *
 * Escopo pedido: somente leitura de planilhas
 * (`spreadsheets.readonly`) e leitura de nomes de arquivo
 * (`drive.metadata.readonly`). A aplicação não precisa escrever na conta
 * Google de ninguém, então não pede essa permissão.
 */
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { ambienteServidor, ErroConfiguracao } from '@/lib/ambiente';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

export const ESCOPOS_GOOGLE = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export interface CredenciaisGoogle {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  scope?: string;
  email?: string;
}

export function criarClienteOAuth(): OAuth2Client {
  if (!ambienteServidor.googleClienteId || !ambienteServidor.googleClienteSegredo) {
    throw new ErroConfiguracao(
      'Google não configurado. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local. Passo a passo em OWNER_SETUP_GUIDE.md, seção GOOGLE SHEETS.',
    );
  }

  return new google.auth.OAuth2(
    ambienteServidor.googleClienteId,
    ambienteServidor.googleClienteSegredo,
    ambienteServidor.googleUrlRetorno ||
      `${process.env.NEXT_PUBLIC_URL_APLICACAO ?? 'http://localhost:3000'}/api/integracoes/google/retorno`,
  );
}

/**
 * URL para o usuário autorizar.
 *
 * `access_type: offline` e `prompt: consent` são obrigatórios: sem os
 * dois o Google não devolve refresh token na segunda autorização, e a
 * integração para de funcionar sozinha em uma hora.
 */
export function urlAutorizacao(estado: string): string {
  return criarClienteOAuth().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ESCOPOS_GOOGLE,
    state: estado,
    include_granted_scopes: true,
  });
}

export async function trocarCodigoPorTokens(codigo: string): Promise<CredenciaisGoogle> {
  const cliente = criarClienteOAuth();
  const { tokens } = await cliente.getToken(codigo);

  if (!tokens.refresh_token) {
    throw new Error(
      'O Google não devolveu o token de atualização. Revogue o acesso da aplicação em myaccount.google.com/permissions e autorize novamente.',
    );
  }

  let email: string | undefined;
  try {
    cliente.setCredentials(tokens);
    const info = await google.oauth2({ version: 'v2', auth: cliente }).userinfo.get();
    email = info.data.email ?? undefined;
  } catch {
    // Sem o e-mail a integração funciona igual; é só rótulo na tela.
  }

  return {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    email,
  };
}

/**
 * Cliente autenticado de uma integração. Renova o access token quando
 * vencido e guarda o novo — assim a sincronização não falha por token
 * expirado no meio da madrugada.
 */
export async function clienteAutenticado(integracaoId: string): Promise<OAuth2Client> {
  const supabase = clienteAdministrador();

  const { data: integracao, error } = await supabase
    .from('integracoes')
    .select('id, organizacao_id, credenciais, status')
    .eq('id', integracaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler integração: ${error.message}`);
  if (!integracao) throw new Error('Integração não encontrada');

  const credenciais = (integracao.credenciais ?? {}) as CredenciaisGoogle;

  if (!credenciais.refresh_token) {
    throw new Error(
      'Esta integração ainda não foi autorizada no Google. Abra Integrações > Google Sheets e clique em Conectar.',
    );
  }

  const cliente = criarClienteOAuth();
  cliente.setCredentials({
    refresh_token: credenciais.refresh_token,
    access_token: credenciais.access_token,
    expiry_date: credenciais.expiry_date,
  });

  cliente.on('tokens', (tokens) => {
    void supabase
      .from('integracoes')
      .update({
        credenciais: {
          ...credenciais,
          access_token: tokens.access_token ?? credenciais.access_token,
          expiry_date: tokens.expiry_date ?? credenciais.expiry_date,
        } as Json,
        status: 'CONECTADA',
        ultimo_erro: null,
      })
      .eq('id', integracaoId)
      .then(({ error: erroGravacao }) => {
        if (erroGravacao) {
          log.error('Falha ao guardar token renovado do Google', {
            organizacao_id: integracao.organizacao_id,
            erro: erroGravacao.message,
          });
        }
      });
  });

  return cliente;
}

export interface DadosPlanilha {
  titulo: string | null;
  linhas: string[][];
}

export async function lerPlanilha(
  integracaoId: string,
  planilhaId: string,
  aba: string,
  intervalo: string,
): Promise<DadosPlanilha> {
  const auth = await clienteAutenticado(integracaoId);
  const sheets = google.sheets({ version: 'v4', auth });

  const faixa = `${aba}!${intervalo}`;

  const [valores, metadados] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: planilhaId,
      range: faixa,
      // Traz o que o usuário vê na tela, e não a fórmula. Telefone
      // formatado na planilha chega formatado — a normalização é nossa.
      valueRenderOption: 'FORMATTED_VALUE',
    }),
    sheets.spreadsheets
      .get({ spreadsheetId: planilhaId, fields: 'properties.title' })
      .catch(() => null),
  ]);

  return {
    titulo: metadados?.data.properties?.title ?? null,
    linhas: (valores.data.values ?? []).map((linha) =>
      (linha as unknown[]).map((celula) => String(celula ?? '')),
    ),
  };
}

/** Índice numérico de uma coluna: "A" -> 0, "B" -> 1, "AA" -> 26. */
export function indiceDaColuna(letra: string): number {
  const limpa = letra.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(limpa)) return -1;

  let indice = 0;
  for (const caractere of limpa) {
    indice = indice * 26 + (caractere.charCodeAt(0) - 64);
  }
  return indice - 1;
}
