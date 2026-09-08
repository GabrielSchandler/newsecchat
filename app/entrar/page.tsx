import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ambientePublico, integracaoConfigurada } from '@/lib/ambiente';
import { FormularioEntrada } from './formulario';

export const metadata: Metadata = { title: 'Entrar' };

export default function PaginaEntrar() {
  const supabaseConfigurado = Boolean(
    ambientePublico.supabaseUrl && ambientePublico.supabaseChaveAnonima,
  );

  return (
    <main className="grid min-h-screen bg-tinta-950 lg:grid-cols-[1fr_minmax(0,520px)]">
      {/* Painel de marca. Some no celular: no telefone só interessa entrar. */}
      <section className="relative hidden overflow-hidden border-r border-tinta-800 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(227,27,35,0.14),transparent_55%),radial-gradient(circle_at_80%_75%,rgba(15,118,110,0.16),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md text-[28px] font-semibold leading-tight tracking-tight text-white">
            Todo o atendimento de WhatsApp da operação em um só lugar.
          </p>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-bruma-400">
            Atendimento humano e inteligência artificial na mesma conversa, com histórico,
            memória do cliente e indicadores reais.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-14">
        {supabaseConfigurado ? (
          <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-lg bg-tinta-800" />}>
            <FormularioEntrada nomeAplicacao={ambientePublico.nomeAplicacao} />
          </Suspense>
        ) : (
          <ConfiguracaoPendente />
        )}
      </section>
    </main>
  );
}

/**
 * Sem Supabase configurado não existe login possível. Em vez de uma tela
 * de erro genérica, esta explica o que preencher e onde.
 */
function ConfiguracaoPendente() {
  return (
    <div className="w-full max-w-[420px]">
      <h1 className="text-[22px] font-semibold tracking-tight text-white">
        Falta configurar o banco de dados
      </h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-bruma-400">
        A aplicação subiu, mas ainda não sabe onde ficam os dados. Preencha o arquivo
        <code className="mx-1 rounded bg-tinta-900 px-1.5 py-0.5 text-[12px] text-bruma-200">
          .env.local
        </code>
        na pasta do projeto:
      </p>

      <pre className="mt-4 overflow-x-auto rounded-lg border border-tinta-800 bg-tinta-900 p-4 text-[12px] leading-relaxed text-bruma-300">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...`}
      </pre>

      <ol className="mt-5 space-y-2 text-[13px] leading-relaxed text-bruma-400">
        <li>1. Entre em supabase.com e abra o seu projeto.</li>
        <li>2. Vá em Project Settings → API.</li>
        <li>3. Copie a URL e as duas chaves para o arquivo acima.</li>
        <li>
          4. Pare a aplicação e rode
          <code className="mx-1 rounded bg-tinta-900 px-1.5 py-0.5 text-[12px] text-bruma-200">
            npm run dev
          </code>
          de novo.
        </li>
      </ol>

      <p className="mt-5 text-[13px] leading-relaxed text-bruma-500">
        O passo a passo completo, com prints do que clicar, está no arquivo
        <span className="text-bruma-300"> OWNER_SETUP_GUIDE.md</span>, seção SUPABASE.
      </p>

      {!integracaoConfigurada('SUPABASE_SERVICO') ? null : (
        <p className="mt-3 text-[12.5px] text-bruma-600">
          A chave de serviço já está preenchida — faltam as duas públicas.
        </p>
      )}
    </div>
  );
}
