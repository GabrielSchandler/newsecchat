'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { aceitarConviteComCadastro } from './acoes';

export function FormularioConvite({
  token,
  email,
  nomeOrganizacao,
  jaLogadoComOutroEmail,
  emailAtual,
}: {
  token: string;
  email: string;
  nomeOrganizacao: string;
  jaLogadoComOutroEmail: boolean;
  emailAtual: string | null;
}) {
  const roteador = useRouter();
  const [erro, definirErro] = React.useState<string | null>(null);
  const [aviso, definirAviso] = React.useState<string | null>(null);
  const [enviando, definirEnviando] = React.useState(false);

  if (jaLogadoComOutroEmail) {
    return (
      <div className="w-full max-w-[420px] text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Convite para outro e-mail</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-bruma-400">
          Este convite foi enviado para <strong className="text-bruma-200">{email}</strong>, mas você está
          conectado como <strong className="text-bruma-200">{emailAtual}</strong>. Saia da conta atual e
          abra o link de novo.
        </p>
        <Link
          href="/entrar"
          className="mt-5 inline-block rounded-lg bg-produto-700 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-produto-800"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    definirErro(null);
    definirAviso(null);
    definirEnviando(true);

    const dados = new FormData(evento.currentTarget);
    dados.set('token', token);

    try {
      const resposta = await aceitarConviteComCadastro(dados);

      if (!resposta.ok) {
        definirErro(resposta.erro ?? 'Não foi possível concluir.');
        return;
      }

      if (resposta.mensagem) {
        definirAviso(resposta.mensagem);
        return;
      }

      roteador.refresh();
      roteador.replace('/atendimento');
    } catch {
      definirErro('Falha de comunicação com o servidor.');
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-white">
        Você foi convidado para {nomeOrganizacao}
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-bruma-400">
        Crie sua senha para entrar na central de atendimento.
      </p>

      <form onSubmit={aoEnviar} className="mt-7 space-y-4">
        <Campo rotulo="E-mail">
          <Entrada
            value={email}
            readOnly
            disabled
            className="border-tinta-800 bg-tinta-900 text-bruma-400"
          />
        </Campo>

        <Campo rotulo="Seu nome" htmlFor="convite-nome" obrigatorio>
          <Entrada
            id="convite-nome"
            name="nome"
            required
            autoComplete="name"
            className="border-tinta-700 bg-tinta-900 text-white placeholder:text-bruma-600 focus:border-produto-500"
          />
        </Campo>

        <Campo
          rotulo="Senha"
          htmlFor="convite-senha"
          obrigatorio
          ajuda={<span className="text-bruma-500">Pelo menos 8 caracteres, com letra e número.</span>}
        >
          <Entrada
            id="convite-senha"
            name="senha"
            type="password"
            required
            autoComplete="new-password"
            className="border-tinta-700 bg-tinta-900 text-white focus:border-produto-500"
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
          Entrar na equipe
        </Botao>
      </form>
    </div>
  );
}
