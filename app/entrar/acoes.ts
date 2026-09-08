'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { conferirLimite } from '@/lib/nucleo/limitador';
import { ambientePublico } from '@/lib/ambiente';
import { log } from '@/lib/log';

export interface RespostaAcao {
  ok: boolean;
  erro?: string;
  mensagem?: string;
}

const esquemaEntrada = z.object({
  email: z.string().email('Informe um e-mail válido'),
  senha: z.string().min(1, 'Informe a senha'),
});

const esquemaCadastro = z.object({
  nome: z.string().min(2, 'Informe seu nome'),
  email: z.string().email('Informe um e-mail válido'),
  senha: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .regex(/[a-zA-Z]/, 'A senha precisa de pelo menos uma letra')
    .regex(/[0-9]/, 'A senha precisa de pelo menos um número'),
});

async function identificacaoDaRequisicao() {
  const cabecalhos = await headers();
  return {
    ip:
      cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      cabecalhos.get('x-real-ip') ??
      null,
    agente: cabecalhos.get('user-agent'),
  };
}

export async function entrar(dados: FormData): Promise<RespostaAcao> {
  const conferido = esquemaEntrada.safeParse({
    email: String(dados.get('email') ?? '').trim().toLowerCase(),
    senha: String(dados.get('senha') ?? ''),
  });

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const { ip, agente } = await identificacaoDaRequisicao();

  // Trava contra tentativa em série a partir do mesmo endereço.
  const limite = conferirLimite(`entrar:${ip ?? 'desconhecido'}`, 10, 5 * 60_000);
  if (!limite.permitido) {
    return {
      ok: false,
      erro: `Muitas tentativas. Tente de novo em ${Math.ceil(limite.reiniciaEmMs / 60000)} minuto(s).`,
    };
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: conferido.data.email,
    password: conferido.data.senha,
  });

  if (error) {
    log.warn('Tentativa de entrada recusada', { motivo: error.message });
    // Mensagem única para senha errada e e-mail inexistente: dizer qual
    // dos dois falhou revelaria quem tem conta no sistema.
    return { ok: false, erro: 'E-mail ou senha incorretos.' };
  }

  if (data.user) {
    const { data: membro } = await supabase
      .from('membros_organizacao')
      .select('organizacao_id')
      .eq('perfil_id', data.user.id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    await registrarAuditoria({
      organizacaoId: membro?.organizacao_id ?? null,
      acao: ACOES.ENTRAR,
      atorPerfilId: data.user.id,
      atorEmail: data.user.email ?? null,
      enderecoIp: ip,
      agenteUsuario: agente,
    });
  }

  return { ok: true };
}

export async function cadastrar(dados: FormData): Promise<RespostaAcao> {
  const conferido = esquemaCadastro.safeParse({
    nome: String(dados.get('nome') ?? '').trim(),
    email: String(dados.get('email') ?? '').trim().toLowerCase(),
    senha: String(dados.get('senha') ?? ''),
  });

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const { ip } = await identificacaoDaRequisicao();
  const limite = conferirLimite(`cadastro:${ip ?? 'desconhecido'}`, 5, 60 * 60_000);
  if (!limite.permitido) {
    return { ok: false, erro: 'Muitas contas criadas deste endereço. Tente mais tarde.' };
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: conferido.data.email,
    password: conferido.data.senha,
    options: {
      data: { nome: conferido.data.nome },
      emailRedirectTo: `${ambientePublico.urlAplicacao}/entrar`,
    },
  });

  if (error) {
    return { ok: false, erro: traduzirErroCadastro(error.message) };
  }

  // Com confirmação de e-mail ligada no Supabase, não vem sessão agora.
  if (!data.session) {
    return {
      ok: true,
      mensagem:
        'Conta criada. Confira seu e-mail e clique no link de confirmação para entrar. Se não chegar em alguns minutos, veja a caixa de spam.',
    };
  }

  return { ok: true };
}

export async function sair(): Promise<void> {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: membro } = await supabase
      .from('membros_organizacao')
      .select('organizacao_id')
      .eq('perfil_id', user.id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    await registrarAuditoria({
      organizacaoId: membro?.organizacao_id ?? null,
      acao: ACOES.SAIR,
      atorPerfilId: user.id,
      atorEmail: user.email ?? null,
    });
  }

  await supabase.auth.signOut();
  redirect('/entrar');
}

function traduzirErroCadastro(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes('already registered') || texto.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail. Use a opção de entrar.';
  }
  if (texto.includes('password')) {
    return 'A senha não atende ao mínimo exigido pelo Supabase.';
  }
  if (texto.includes('signups not allowed') || texto.includes('signup is disabled')) {
    return 'A criação de contas está desligada no Supabase. Ligue em Authentication > Providers > Email.';
  }

  return `Não foi possível criar a conta: ${mensagem}`;
}
