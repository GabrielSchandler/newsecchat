'use server';

import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { conferirLimite } from '@/lib/nucleo/limitador';
import { log } from '@/lib/log';

export interface RespostaConvite {
  ok: boolean;
  erro?: string;
  mensagem?: string;
}

const esquema = z.object({
  token: z.string().min(20),
  nome: z.string().trim().min(2, 'Informe seu nome').max(80),
  senha: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .regex(/[a-zA-Z]/, 'A senha precisa de pelo menos uma letra')
    .regex(/[0-9]/, 'A senha precisa de pelo menos um número'),
});

/**
 * Cria a conta e já vincula à organização do convite.
 *
 * O e-mail NÃO vem do formulário: vem do convite, lido no servidor. Se
 * viesse do formulário, qualquer pessoa com o link entraria com o e-mail
 * que quisesse, e a checagem de e-mail dentro de `aceitar_convite`
 * passaria a comparar dois valores escolhidos pela mesma pessoa.
 */
export async function aceitarConviteComCadastro(dados: FormData): Promise<RespostaConvite> {
  const conferido = esquema.safeParse({
    token: String(dados.get('token') ?? ''),
    nome: String(dados.get('nome') ?? '').trim(),
    senha: String(dados.get('senha') ?? ''),
  });

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const limite = conferirLimite(`convite:${conferido.data.token}`, 8, 15 * 60_000);
  if (!limite.permitido) {
    return { ok: false, erro: 'Muitas tentativas com este convite. Aguarde alguns minutos.' };
  }

  const admin = clienteAdministrador();

  const { data: convite } = await admin
    .from('convites')
    .select('email, expira_em, aceito_em')
    .eq('token', conferido.data.token)
    .maybeSingle();

  if (!convite) return { ok: false, erro: 'Convite não encontrado.' };
  if (convite.aceito_em) return { ok: false, erro: 'Este convite já foi usado.' };
  if (new Date(convite.expira_em) < new Date()) return { ok: false, erro: 'Este convite expirou.' };

  const supabase = await clienteServidor();

  const { data: cadastro, error: erroCadastro } = await supabase.auth.signUp({
    email: convite.email,
    password: conferido.data.senha,
    options: { data: { nome: conferido.data.nome } },
  });

  if (erroCadastro) {
    const texto = erroCadastro.message.toLowerCase();
    if (texto.includes('already registered') || texto.includes('already been registered')) {
      return {
        ok: false,
        erro: 'Já existe uma conta com este e-mail. Entre pelo login e abra o link do convite de novo.',
      };
    }
    return { ok: false, erro: `Não foi possível criar a conta: ${erroCadastro.message}` };
  }

  // Com confirmação de e-mail ligada, ainda não há sessão para aceitar o
  // convite. Ele continua válido e é aceito no primeiro acesso.
  if (!cadastro.session) {
    return {
      ok: true,
      mensagem:
        'Conta criada. Confirme o e-mail que acabamos de enviar e depois abra este mesmo link do convite para entrar na equipe.',
    };
  }

  const { error: erroConvite } = await supabase.rpc('aceitar_convite', {
    p_token: conferido.data.token,
  });

  if (erroConvite) {
    log.error('Conta criada, mas o convite não foi aceito', { erro: erroConvite.message });
    return {
      ok: false,
      erro: `Sua conta foi criada, mas não conseguimos vincular ao time: ${erroConvite.message}. Avise quem te convidou.`,
    };
  }

  return { ok: true };
}
