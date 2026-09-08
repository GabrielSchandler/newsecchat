/**
 * Renovação de sessão e porteiro das rotas.
 *
 * O middleware precisa reescrever os cookies do Supabase a cada
 * requisição — é o que mantém o usuário logado sem ele perceber. O
 * detalhe fácil de errar: a resposta devolvida tem de ser a MESMA em que
 * os cookies foram gravados, senão o token renovado se perde e o usuário
 * é deslogado sozinho depois de uma hora.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/** Rotas que não exigem sessão. */
const PUBLICAS = ['/entrar', '/recuperar-senha', '/redefinir-senha', '/convite'];

export async function middleware(requisicao: NextRequest) {
  const caminho = requisicao.nextUrl.pathname;

  // O webhook é chamado por servidor, não por navegador: não tem sessão e
  // se autentica pelo segredo na própria URL.
  if (caminho.startsWith('/api/webhooks')) {
    return NextResponse.next();
  }

  let resposta = NextResponse.next({ request: requisicao });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem configuração não há sessão para renovar. Deixar passar aqui faz a
  // página mostrar a orientação de configuração, em vez de um erro cru.
  if (!url || !chave) return resposta;

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return requisicao.cookies.getAll();
      },
      setAll(lista: CookieParaGravar[]) {
        for (const { name, value } of lista) {
          requisicao.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request: requisicao });
        for (const { name, value, options } of lista) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ehPublica = PUBLICAS.some((rota) => caminho.startsWith(rota));

  if (!user && !ehPublica) {
    const destino = requisicao.nextUrl.clone();
    destino.pathname = '/entrar';
    // Guarda para onde o usuário queria ir e leva-o de volta após entrar.
    if (caminho !== '/') destino.searchParams.set('proximo', caminho);
    return NextResponse.redirect(destino);
  }

  if (user && caminho === '/entrar') {
    const destino = requisicao.nextUrl.clone();
    destino.pathname = '/atendimento';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos arquivo estático e imagem. O `_next/static` não precisa
     * de sessão e passar por aqui só somaria latência a cada asset.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
