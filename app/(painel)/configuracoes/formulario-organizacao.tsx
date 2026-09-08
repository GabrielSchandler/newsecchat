'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  RodapeCartao,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import type { Organizacao } from '@/lib/tipos-banco';
import { salvarOrganizacao } from './acoes';

/** Fusos do Brasil. Chega para o público do produto e evita uma lista de 400 itens. */
const FUSOS = [
  { valor: 'America/Sao_Paulo', rotulo: 'Brasília (São Paulo, Rio, Minas, Sul, Nordeste)' },
  { valor: 'America/Manaus', rotulo: 'Manaus (Amazonas, Mato Grosso, Rondônia, Roraima)' },
  { valor: 'America/Cuiaba', rotulo: 'Cuiabá (Mato Grosso)' },
  { valor: 'America/Belem', rotulo: 'Belém (Pará, Amapá)' },
  { valor: 'America/Fortaleza', rotulo: 'Fortaleza (Ceará, Piauí, Maranhão)' },
  { valor: 'America/Rio_Branco', rotulo: 'Rio Branco (Acre)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha' },
];

export function FormularioOrganizacao({ organizacao }: { organizacao: Organizacao }) {
  const roteador = useRouter();
  const [nome, definirNome] = React.useState(organizacao.nome);
  const [fuso, definirFuso] = React.useState(organizacao.fuso_horario);
  const [documento, definirDocumento] = React.useState(organizacao.documento ?? '');
  const [salvando, definirSalvando] = React.useState(false);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    definirSalvando(true);
    try {
      const resultado = await salvarOrganizacao({
        nome,
        fusoHorario: fuso,
        documento: documento.trim() || null,
      });

      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível salvar.');
        return;
      }

      toast.success('Dados da organização salvos.');
      roteador.refresh();
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar}>
      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Dados da organização</TituloCartao>
          <DescricaoCartao>
            O fuso horário decide o horário de atendimento da IA e a janela de envio das campanhas.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-4">
          <Campo rotulo="Nome" htmlFor="org-nome" obrigatorio>
            <Entrada
              id="org-nome"
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              maxLength={120}
              required
            />
          </Campo>

          <Campo
            rotulo="Fuso horário"
            htmlFor="org-fuso"
            ajuda="Errar aqui faz uma campanha marcada para as 9h sair na madrugada."
          >
            <Selecao id="org-fuso" value={fuso} onChange={(evento) => definirFuso(evento.target.value)}>
              {FUSOS.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="CNPJ ou CPF" htmlFor="org-documento" ajuda="Opcional. Usado só em relatórios.">
            <Entrada
              id="org-documento"
              value={documento}
              onChange={(evento) => definirDocumento(evento.target.value)}
              maxLength={20}
              placeholder="00.000.000/0000-00"
            />
          </Campo>

          <div className="rounded-lg border border-bruma-200 bg-bruma-50 px-3 py-2.5">
            <p className="text-[12.5px] text-bruma-600">
              Identificador interno:{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-[12px] text-tinta-800">
                {organizacao.apelido}
              </code>
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-bruma-500">
              Não muda: ele compõe o nome das instâncias de WhatsApp já conectadas.
            </p>
          </div>
        </CorpoCartao>

        <RodapeCartao>
          <Botao type="submit" carregando={salvando}>
            Salvar
          </Botao>
        </RodapeCartao>
      </Cartao>
    </form>
  );
}
