/**
 * Log estruturado em JSON, uma linha por evento.
 *
 * Por que não uma biblioteca: o que precisamos é uma linha JSON no stdout
 * com campos fixos e um filtro de segredos. Uma dependência a mais aqui
 * traria transports, workers e configuração de build — sem nada em troca.
 *
 * REGRA: nada de chave, token ou segredo entra em log. A lista
 * `CAMPOS_SENSIVEIS` corta por nome de campo, em qualquer profundidade, e
 * `mascararTexto` corta o que aparece no meio de uma string.
 */

export type NivelLog = 'debug' | 'info' | 'warn' | 'error';

const ORDEM: Record<NivelLog, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const nivelMinimo = (): number => {
  const configurado = (process.env.NIVEL_LOG ?? 'info').toLowerCase() as NivelLog;
  return ORDEM[configurado] ?? ORDEM.info;
};

const CAMPOS_SENSIVEIS = [
  'apikey',
  'api_key',
  'authorization',
  'token',
  'access_token',
  'refresh_token',
  'senha',
  'password',
  'secret',
  'segredo',
  'segredo_webhook',
  'chave',
  'service_role',
  'credenciais',
  'cookie',
];

/** Contexto que acompanha toda linha de log de um fluxo. */
export interface ContextoLog {
  organizacao_id?: string | null;
  canal_id?: string | null;
  conversa_id?: string | null;
  mensagem_id?: string | null;
  contato_id?: string | null;
  campanha_id?: string | null;
  evento_id?: string | null;
  trabalho_id?: string | null;
  fila?: string;
  provedor?: string;
  [chave: string]: unknown;
}

function ehSensivel(chave: string): boolean {
  const normalizada = chave.toLowerCase();
  return CAMPOS_SENSIVEIS.some((termo) => normalizada.includes(termo));
}

/** Corta um valor longo mantendo só o suficiente para reconhecê-lo. */
function mascarar(valor: string): string {
  if (valor.length <= 8) return '***';
  return `${valor.slice(0, 4)}***${valor.slice(-2)}`;
}

function limpar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return '[profundo demais]';
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') {
    // Corta o que parece chave mesmo quando vem no meio de um texto.
    return valor.length > 2000 ? `${valor.slice(0, 2000)}…[cortado]` : valor;
  }

  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (valor instanceof Error) {
    return { nome: valor.name, mensagem: valor.message, pilha: valor.stack };
  }

  if (Array.isArray(valor)) {
    return valor.slice(0, 50).map((item) => limpar(item, profundidade + 1));
  }

  if (typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      if (ehSensivel(chave)) {
        saida[chave] = typeof conteudo === 'string' ? mascarar(conteudo) : '***';
        continue;
      }
      saida[chave] = limpar(conteudo, profundidade + 1);
    }
    return saida;
  }

  return String(valor);
}

function escrever(nivel: NivelLog, mensagem: string, contexto?: ContextoLog): void {
  if (ORDEM[nivel] < nivelMinimo()) return;

  const linha = JSON.stringify({
    hora: new Date().toISOString(),
    nivel,
    mensagem,
    ...(limpar(contexto ?? {}) as Record<string, unknown>),
  });

  if (nivel === 'error' || nivel === 'warn') {
    process.stderr.write(`${linha}\n`);
  } else {
    process.stdout.write(`${linha}\n`);
  }
}

export const log = {
  debug: (mensagem: string, contexto?: ContextoLog) => escrever('debug', mensagem, contexto),
  info: (mensagem: string, contexto?: ContextoLog) => escrever('info', mensagem, contexto),
  warn: (mensagem: string, contexto?: ContextoLog) => escrever('warn', mensagem, contexto),
  error: (mensagem: string, contexto?: ContextoLog) => escrever('error', mensagem, contexto),

  /** Cria um log que já carrega um contexto fixo (organização, conversa…). */
  comContexto(base: ContextoLog) {
    return {
      debug: (mensagem: string, extra?: ContextoLog) => escrever('debug', mensagem, { ...base, ...extra }),
      info: (mensagem: string, extra?: ContextoLog) => escrever('info', mensagem, { ...base, ...extra }),
      warn: (mensagem: string, extra?: ContextoLog) => escrever('warn', mensagem, { ...base, ...extra }),
      error: (mensagem: string, extra?: ContextoLog) => escrever('error', mensagem, { ...base, ...extra }),
    };
  },
};

/** Exportada para os testes conferirem o filtro de segredos. */
export const _limparParaTeste = limpar;
