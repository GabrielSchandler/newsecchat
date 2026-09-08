'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada } from '@/componentes/ui/campo';
import { Cartao, CorpoCartao, RodapeCartao } from '@/componentes/ui/estrutura';
import { cn } from '@/lib/utilitarios';
import { criarOrganizacao } from './acoes';

const MODELOS = [
  {
    valor: 'SERVICOS_FINANCEIROS',
    titulo: 'Serviços financeiros',
    descricao:
      'Já vem com os campos de instituição, tipo de contrato, valor e parcela para a IA coletar.',
  },
  {
    valor: 'GENERICO',
    titulo: 'Começar do zero',
    descricao: 'Só o essencial. Você cria os campos que a IA deve coletar na tela de configurações.',
  },
] as const;

export function FormularioOrganizacao({ nomeUsuario }: { nomeUsuario: string }) {
  const roteador = useRouter();
  const [modelo, definirModelo] = React.useState<string>('SERVICOS_FINANCEIROS');
  const [erro, definirErro] = React.useState<string | null>(null);
  const [enviando, definirEnviando] = React.useState(false);

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    definirErro(null);
    definirEnviando(true);

    const dados = new FormData(evento.currentTarget);
    dados.set('modelo', modelo);

    try {
      const resposta = await criarOrganizacao(dados);
      if (!resposta.ok) {
        definirErro(resposta.erro ?? 'Não foi possível criar a organização.');
        return;
      }
      roteador.refresh();
      roteador.replace('/configuracoes/canais');
    } catch {
      definirErro('Falha de comunicação com o servidor. Tente de novo.');
    } finally {
      definirEnviando(false);
    }
  }

  const primeiroNome = nomeUsuario.split(/[\s@]/)[0] ?? '';

  return (
    <div className="w-full max-w-[560px]">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tinta-950">
          <Building2 className="h-4.5 w-4.5 text-white" aria-hidden />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-tinta-950">
            {primeiroNome ? `Bem-vindo, ${primeiroNome}.` : 'Bem-vindo.'} Vamos criar sua organização.
          </h1>
          <p className="mt-0.5 text-[13px] text-bruma-600">
            É o espaço onde ficam seus números, contatos e conversas.
          </p>
        </div>
      </div>

      <form onSubmit={aoEnviar}>
        <Cartao>
          <CorpoCartao className="space-y-5">
            <Campo
              rotulo="Nome da empresa"
              htmlFor="nome"
              obrigatorio
              ajuda="É o nome que aparece na barra lateral e nos relatórios."
            >
              <Entrada id="nome" name="nome" required maxLength={120} placeholder="Minha Empresa Ltda" />
            </Campo>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-tinta-800">
                Como quer começar?
              </legend>
              <p className="mb-2.5 text-xs leading-relaxed text-bruma-600">
                Só define os campos iniciais que a IA vai coletar. Dá para mudar tudo depois.
              </p>

              <div className="space-y-2">
                {MODELOS.map((opcao) => {
                  const selecionado = modelo === opcao.valor;
                  return (
                    <button
                      key={opcao.valor}
                      type="button"
                      onClick={() => definirModelo(opcao.valor)}
                      aria-pressed={selecionado}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
                        selecionado
                          ? 'border-produto-700 bg-produto-50'
                          : 'border-bruma-300 bg-white hover:bg-bruma-50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selecionado ? 'border-produto-700 bg-produto-700' : 'border-bruma-400',
                        )}
                      >
                        {selecionado ? <Check className="h-3 w-3 text-white" aria-hidden /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-tinta-900">
                          {opcao.titulo}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-bruma-600">
                          {opcao.descricao}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {erro ? (
              <p
                role="alert"
                className="rounded-lg border border-marca-50 bg-marca-50 px-3 py-2 text-[13px] leading-relaxed text-marca-600"
              >
                {erro}
              </p>
            ) : null}
          </CorpoCartao>

          <RodapeCartao>
            <Botao type="submit" carregando={enviando}>
              Criar organização
            </Botao>
          </RodapeCartao>
        </Cartao>
      </form>

      <p className="mt-4 text-[12.5px] leading-relaxed text-bruma-600">
        Depois disso você conecta o primeiro número de WhatsApp. Vamos direto para essa tela.
      </p>
    </div>
  );
}
