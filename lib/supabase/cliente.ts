'use client';

/**
 * Cliente Supabase do navegador. Usa a chave anônima — a única que pode
 * chegar ao browser. Toda leitura feita por aqui passa por RLS.
 */
import { createBrowserClient } from '@supabase/ssr';
import { ambientePublico } from '@/lib/ambiente';
import type { BancoDados } from '@/lib/tipos-banco';

let instancia: ReturnType<typeof createBrowserClient<BancoDados>> | null = null;

export function clienteNavegador() {
  if (!instancia) {
    instancia = createBrowserClient<BancoDados>(
      ambientePublico.supabaseUrl,
      ambientePublico.supabaseChaveAnonima,
    );
  }
  return instancia;
}
