'use server';

import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { gerarApelido } from '@/lib/utilitarios';
import { log } from '@/lib/log';

export interface RespostaCriacao {
  ok: boolean;
  erro?: string;
}

const esquema = z.object({
  nome: z.string().min(2, 'Informe o nome da empresa').max(120),
  modelo: z.enum(['GENERICO', 'SERVICOS_FINANCEIROS']),
});

export async function criarOrganizacao(dados: FormData): Promise<RespostaCriacao> {
  const conferido = esquema.safeParse({
    nome: String(dados.get('nome') ?? '').trim(),
    modelo: String(dados.get('modelo') ?? 'GENERICO'),
  });

  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre de novo.' };

  const apelidoBase = gerarApelido(conferido.data.nome) || 'empresa';

  // O apelido precisa ser único no sistema inteiro. Em vez de devolver
  // erro para o usuário resolver, tenta sufixos até achar um livre.
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const apelido = tentativa === 0 ? apelidoBase : `${apelidoBase}-${tentativa + 1}`;

    const { error } = await supabase.rpc('criar_organizacao_inicial', {
      p_nome: conferido.data.nome,
      p_apelido: apelido,
      p_modelo: conferido.data.modelo,
    });

    if (!error) return { ok: true };

    if (error.message.includes('já pertence a uma organização')) {
      // Já tem organização: seguir para a central é o resultado correto.
      return { ok: true };
    }

    const ehApelidoEmUso =
      error.code === '23505' || error.message.includes('organizacoes_apelido_idx');

    if (!ehApelidoEmUso) {
      log.error('Falha ao criar organização', { erro: error.message });
      return { ok: false, erro: traduzirErro(error.message) };
    }
  }

  return {
    ok: false,
    erro: 'Não foi possível gerar um identificador livre para esta empresa. Tente um nome diferente.',
  };
}

function traduzirErro(mensagem: string): string {
  if (mensagem.includes('does not exist') || mensagem.includes('não existe')) {
    return 'O banco de dados ainda não tem as tabelas da aplicação. Rode "npm run banco:aplicar" — ver OWNER_SETUP_GUIDE.md, seção SUPABASE.';
  }
  return `Não foi possível criar a organização: ${mensagem}`;
}
