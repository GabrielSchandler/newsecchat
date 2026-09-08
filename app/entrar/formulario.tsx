'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquareText } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { cadastrar, entrar } from './acoes';

type Modo = 'ENTRAR' | 'CADASTRAR';

export function FormularioEntrada({ nomeAplicacao }: { nomeAplicacao: string }) {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const [modo, definirModo] = React.useState<Modo>('ENTRAR');
  const [erro, definirErro] = React.useState<string | null>(null);
  const [aviso, definirAviso] = React.useState<string | null>(null);
  const [enviando, definirEnviando] = React.useState(false);

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    definirErro(null);
    definirAviso(null);
    definirEnviando(true);

    const dados = new FormData(evento.currentTarget);

    try {
      const resposta = modo === 'ENTRAR' ? await entrar(dados) : await cadastrar(dados);

      if (!resposta.ok) {
        definirErro(resposta.erro ?? 'Não foi possível concluir.');
        return;
      }

      if (resposta.mensagem) {
        definirAviso(resposta.mensagem);
        return;
      }

      // `refresh` antes de navegar: o middleware precisa enxergar o cookie
      // de sessão recém-gravado, senão devolve para o login.
      roteador.refresh();
      roteador.replace(parametros.get('proximo') ?? '/atendimento');
    } catch {
      definirErro('Falha de comunicação com o servidor. Tente de novo.');
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-500">
          <MessageSquareText className="h-5 w-5 text-white" aria-hidden />
        </div>
        <span className="text-[17px] font-semibold tracking-tight text-white">{nomeAplicacao}</span>
      </div>

      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
        {modo === 'ENTRAR' ? 'Entrar na central' : 'Criar sua conta'}
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-bruma-400">
        {modo === 'ENTRAR'
          ? 'Acesse o atendimento, as conversas e os indicadores da sua operação.'
          : 'Crie o primeiro acesso. Na tela seguinte você monta a organização.'}
      </p>

      <form onSubmit={aoEnviar} className="mt-7 space-y-4">
        {modo === 'CADASTRAR' ? (
          <Campo rotulo="Seu nome" htmlFor="nome" obrigatorio>
            <Entrada
              id="nome"
              name="nome"
              autoComplete="name"
              required
              placeholder="Como você quer ser chamado"
              className="border-tinta-700 bg-tinta-900 text-white placeholder:text-bruma-600 focus:border-produto-500"
            />
          </Campo>
        ) : null}

        <Campo rotulo="E-mail" htmlFor="email" obrigatorio>
          <Entrada
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@empresa.com.br"
            className="border-tinta-700 bg-tinta-900 text-white placeholder:text-bruma-600 focus:border-produto-500"
          />
        </Campo>

        <Campo
          rotulo="Senha"
          htmlFor="senha"
          obrigatorio
          ajuda={
            modo === 'CADASTRAR' ? (
              <span className="text-bruma-500">Pelo menos 8 caracteres, com letra e número.</span>
            ) : undefined
          }
        >
          <Entrada
            id="senha"
            name="senha"
            type="password"
            autoComplete={modo === 'ENTRAR' ? 'current-password' : 'new-password'}
            required
            className="border-tinta-700 bg-tinta-900 text-white placeholder:text-bruma-600 focus:border-produto-500"
          />
        </Campo>

        {erro ? (
          <p
            role="alert"
            className="rounded-lg border border-marca-600/40 bg-marca-600/10 px-3 py-2 text-[13px] leading-relaxed text-marca-300"
          >
            {erro}
          </p>
        ) : null}

        {aviso ? (
          <p
            role="status"
            className="rounded-lg border border-produto-700/50 bg-produto-700/10 px-3 py-2 text-[13px] leading-relaxed text-produto-100"
          >
            {aviso}
          </p>
        ) : null}

        <Botao type="submit" tamanho="grande" carregando={enviando} className="w-full">
          {modo === 'ENTRAR' ? 'Entrar' : 'Criar conta'}
        </Botao>
      </form>

      <p className="mt-5 text-[13px] text-bruma-500">
        {modo === 'ENTRAR' ? 'Ainda não tem acesso?' : 'Já tem uma conta?'}{' '}
        <button
          type="button"
          onClick={() => {
            definirModo(modo === 'ENTRAR' ? 'CADASTRAR' : 'ENTRAR');
            definirErro(null);
            definirAviso(null);
          }}
          className="font-medium text-produto-500 underline-offset-4 hover:underline"
        >
          {modo === 'ENTRAR' ? 'Criar conta' : 'Entrar'}
        </button>
      </p>
    </div>
  );
}
