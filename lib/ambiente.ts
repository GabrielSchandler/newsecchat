/**
 * Leitura e validação das variáveis de ambiente.
 *
 * Duas ideias sustentam este arquivo:
 *
 * 1. O que é obrigatório para a aplicação SUBIR (Supabase) é validado na
 *    primeira leitura e falha alto, com mensagem em português dizendo o
 *    que preencher e onde.
 * 2. O que é de INTEGRAÇÃO EXTERNA (Evolution, OpenAI, Redis, Google)
 *    pode faltar. A aplicação continua de pé, a funcionalidade específica
 *    se declara indisponível e a tela explica o que falta — em vez de dar
 *    erro 500 no meio do atendimento.
 */
import { z } from 'zod';

const textoObrigatorio = (nome: string) =>
  z.string({ required_error: `${nome} não está definida` }).min(1, `${nome} está vazia`);

const esquemaObrigatorio = z.object({
  NEXT_PUBLIC_SUPABASE_URL: textoObrigatorio('NEXT_PUBLIC_SUPABASE_URL').url(
    'NEXT_PUBLIC_SUPABASE_URL precisa ser uma URL (https://xxxx.supabase.co)',
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: textoObrigatorio('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
});

/**
 * Variáveis públicas. Precisam ser lidas de forma literal para o Next
 * conseguir substituí-las no build do navegador.
 */
export const ambientePublico = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseChaveAnonima: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  nomeAplicacao: process.env.NEXT_PUBLIC_NOME_APLICACAO ?? 'NewSec Chat',
  urlAplicacao: process.env.NEXT_PUBLIC_URL_APLICACAO ?? 'http://localhost:3000',
};

export function conferirAmbientePublico(): void {
  const resultado = esquemaObrigatorio.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: ambientePublico.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ambientePublico.supabaseChaveAnonima,
  });

  if (!resultado.success) {
    const problemas = resultado.error.issues.map((item) => `  - ${item.message}`).join('\n');
    throw new Error(
      `Configuração incompleta. Preencha o arquivo .env.local:\n${problemas}\n\n` +
        'Onde achar: Supabase > seu projeto > Project Settings > API.\n' +
        'Passo a passo no arquivo OWNER_SETUP_GUIDE.md, seção SUPABASE.',
    );
  }
}

/** Só no servidor. Nunca importe isto de um componente de cliente. */
export const ambienteServidor = {
  supabaseChaveServico: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  urlBanco: process.env.SUPABASE_DB_URL ?? '',

  evolutionUrl: process.env.EVOLUTION_API_URL ?? '',
  evolutionChave: process.env.EVOLUTION_API_KEY ?? '',

  provedorIa: (process.env.PROVEDOR_IA ?? 'OPENAI').toUpperCase(),
  openaiChave: process.env.OPENAI_API_KEY ?? '',
  openaiModeloConversa: process.env.OPENAI_MODELO_CONVERSA ?? 'gpt-4o-mini',
  openaiModeloAnalise: process.env.OPENAI_MODELO_ANALISE ?? 'gpt-4o',
  openaiModeloTranscricao: process.env.OPENAI_MODELO_TRANSCRICAO ?? 'whisper-1',

  redisUrl: process.env.REDIS_URL ?? '',

  googleClienteId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClienteSegredo: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleUrlRetorno: process.env.GOOGLE_REDIRECT_URI ?? '',

  segredoWebhookGlobal: process.env.WEBHOOK_SEGREDO_GLOBAL ?? '',
  nivelLog: process.env.NIVEL_LOG ?? 'info',
  /** Permite processar mensagens sem Redis, direto no processo. Só para desenvolvimento. */
  filaEmMemoria: process.env.FILA_EM_MEMORIA === 'true',
};

/** Integrações que dependem de credencial externa. */
export type NomeIntegracao = 'EVOLUTION' | 'IA' | 'REDIS' | 'GOOGLE_SHEETS' | 'SUPABASE_SERVICO';

export function integracaoConfigurada(nome: NomeIntegracao): boolean {
  switch (nome) {
    case 'EVOLUTION':
      return Boolean(ambienteServidor.evolutionUrl && ambienteServidor.evolutionChave);
    case 'IA':
      return Boolean(ambienteServidor.openaiChave);
    case 'REDIS':
      return Boolean(ambienteServidor.redisUrl);
    case 'GOOGLE_SHEETS':
      return Boolean(ambienteServidor.googleClienteId && ambienteServidor.googleClienteSegredo);
    case 'SUPABASE_SERVICO':
      return Boolean(ambienteServidor.supabaseChaveServico);
    default:
      return false;
  }
}

/** Texto que a tela mostra quando a integração não está configurada. */
export const orientacaoIntegracao: Record<NomeIntegracao, string> = {
  EVOLUTION:
    'Evolution API não configurada. Preencha EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.local (ver OWNER_SETUP_GUIDE.md, seção EVOLUTION API).',
  IA: 'Provedor de IA não configurado. Preencha OPENAI_API_KEY no .env.local (ver OWNER_SETUP_GUIDE.md, seção OPENAI).',
  REDIS:
    'Redis não configurado. Preencha REDIS_URL no .env.local (ver OWNER_SETUP_GUIDE.md, seção REDIS).',
  GOOGLE_SHEETS:
    'Google não configurado. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local (ver OWNER_SETUP_GUIDE.md, seção GOOGLE SHEETS).',
  SUPABASE_SERVICO:
    'SUPABASE_SERVICE_ROLE_KEY não preenchida. Sem ela o recebimento de mensagens não funciona (ver OWNER_SETUP_GUIDE.md, seção SUPABASE).',
};

export function exigirIntegracao(nome: NomeIntegracao): void {
  if (!integracaoConfigurada(nome)) {
    throw new ErroConfiguracao(orientacaoIntegracao[nome]);
  }
}

/**
 * Erro de configuração: falta credencial, não é defeito de código. A
 * aplicação trata este caso mostrando orientação em vez de "erro interno".
 */
export class ErroConfiguracao extends Error {
  readonly configuracao = true;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
  }
}
