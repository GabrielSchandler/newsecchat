/**
 * Cliente Supabase com a chave de serviço.
 *
 * IGNORA RLS por definição. Existe para o que não tem usuário logado:
 * o webhook da Evolution, o worker das filas e a sincronização da
 * planilha. Quem usa este cliente assume a responsabilidade de filtrar
 * por `organizacao_id` em toda consulta — não há rede de proteção abaixo.
 *
 * Este arquivo NÃO importa nada do Next de propósito: o worker é um
 * processo Node comum e precisa conseguir importá-lo.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BancoDados } from '@/lib/tipos-banco';

let instancia: SupabaseClient<BancoDados> | null = null;

export function clienteAdministrador(): SupabaseClient<BancoDados> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !chave) {
    throw new Error(
      'Supabase não configurado para tarefas de fundo. Preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local. Ver OWNER_SETUP_GUIDE.md, seção SUPABASE.',
    );
  }

  if (!instancia) {
    instancia = createClient<BancoDados>(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return instancia;
}

/** Usado nos testes para descartar a instância entre casos. */
export function _reiniciarClienteAdministrador(): void {
  instancia = null;
}
