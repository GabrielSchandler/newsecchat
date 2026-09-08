import 'server-only';

/**
 * Cliente Supabase do servidor, agindo COMO O USUÁRIO logado.
 *
 * RLS vale para tudo que passa por aqui — é o cliente padrão de toda a
 * interface. Para o que não tem usuário (webhook, worker), use
 * `clienteAdministrador()` de `lib/supabase/administrador.ts`, ciente de
 * que ele ignora RLS.
 */
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ambientePublico } from '@/lib/ambiente';
import type { BancoDados } from '@/lib/tipos-banco';

/**
 * O tipo do parâmetro de `setAll` precisa vir anotado. `CookieMethodsServer`
 * é uma união com a forma antiga (get/set/remove) e, sem a anotação, a
 * inferência escolhe a variante errada — o efeito colateral é o cliente
 * inteiro perder a tipagem do banco e toda consulta virar `never`.
 */
type CookieParaGravar = { name: string; value: string; options: CookieOptions };

export async function clienteServidor() {
  const armazenamento = await cookies();

  return createServerClient<BancoDados>(
    ambientePublico.supabaseUrl,
    ambientePublico.supabaseChaveAnonima,
    {
      cookies: {
        getAll() {
          return armazenamento.getAll();
        },
        setAll(lista: CookieParaGravar[]) {
          try {
            for (const { name, value, options } of lista) {
              armazenamento.set(name, value, options);
            }
          } catch {
            // Server Component não pode escrever cookie. O middleware já
            // renovou a sessão antes de chegar aqui, então ignorar é o
            // comportamento correto e não perde sessão.
          }
        },
      },
    },
  );
}

export { clienteAdministrador } from '@/lib/supabase/administrador';
