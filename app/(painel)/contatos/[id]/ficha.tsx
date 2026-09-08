'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Brain, MessageSquare } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  RodapeCartao,
  Selo,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import { cn, formatarDataHora, tempoRelativo } from '@/lib/utilitarios';
import { rotuloEstado } from '@/lib/nucleo/estados';
import type {
  CampoPersonalizado,
  Contato,
  Departamento,
  EstadoConversaBanco,
  Etiqueta,
  MemoriaContato,
} from '@/lib/tipos-banco';
import {
  alternarEtiquetaContato,
  definirAceiteCampanha,
  definirBloqueio,
  salvarContato,
} from '../acoes';

interface ConversaResumo {
  id: string;
  estado: EstadoConversaBanco;
  iniciada_em: string;
  encerrada_em: string | null;
  ultima_mensagem_previa: string | null;
  canal_id: string;
  campanha_id: string | null;
}

export function FichaCompleta({
  contato,
  campos,
  etiquetas,
  etiquetasAtivas,
  conversas,
  memorias,
  departamentos,
  atendentes,
}: {
  contato: Contato;
  campos: { campo: CampoPersonalizado; valor: string }[];
  etiquetas: Etiqueta[];
  etiquetasAtivas: string[];
  conversas: ConversaResumo[];
  memorias: MemoriaContato[];
  departamentos: Departamento[];
  atendentes: { id: string; nome: string }[];
}) {
  const roteador = useRouter();
  const [nome, definirNome] = React.useState(contato.nome ?? '');
  const [email, definirEmail] = React.useState(contato.email ?? '');
  const [documento, definirDocumento] = React.useState(contato.documento ?? '');
  const [observacoes, definirObservacoes] = React.useState(contato.observacoes ?? '');
  const [responsavelId, definirResponsavel] = React.useState(contato.responsavel_id ?? '');
  const [departamentoId, definirDepartamento] = React.useState(contato.departamento_id ?? '');
  const [ehCliente, definirEhCliente] = React.useState(contato.eh_cliente);
  const [valores, definirValores] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((item) => [item.campo.chave, item.valor])),
  );
  const [salvando, definirSalvando] = React.useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    definirSalvando(true);
    try {
      const resultado = await salvarContato({
        contatoId: contato.id,
        nome: nome.trim() || null,
        email: email.trim() || null,
        documento: documento.trim() || null,
        observacoes: observacoes.trim() || null,
        responsavelId: responsavelId || null,
        departamentoId: departamentoId || null,
        ehCliente,
        campos: Object.entries(valores).map(([chave, valor]) => ({ chave, valor })),
      });

      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível salvar.');
        return;
      }

      toast.success('Contato salvo.');
      roteador.refresh();
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-4">
        <form onSubmit={salvar}>
          <Cartao>
            <CabecalhoCartao>
              <TituloCartao>Dados do contato</TituloCartao>
              <DescricaoCartao>
                O que você digitar aqui tem precedência sobre o que a IA deduziu — ela não sobrescreve
                campo preenchido por pessoa.
              </DescricaoCartao>
            </CabecalhoCartao>

            <CorpoCartao className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Nome" htmlFor="contato-nome">
                  <Entrada
                    id="contato-nome"
                    value={nome}
                    onChange={(evento) => definirNome(evento.target.value)}
                    maxLength={120}
                    placeholder={contato.nome_perfil_whatsapp ?? ''}
                  />
                </Campo>

                <Campo rotulo="E-mail" htmlFor="contato-email">
                  <Entrada
                    id="contato-email"
                    type="email"
                    value={email}
                    onChange={(evento) => definirEmail(evento.target.value)}
                    maxLength={160}
                  />
                </Campo>

                <Campo rotulo="CPF ou CNPJ" htmlFor="contato-documento">
                  <Entrada
                    id="contato-documento"
                    value={documento}
                    onChange={(evento) => definirDocumento(evento.target.value)}
                    maxLength={24}
                  />
                </Campo>

                <Campo rotulo="Responsável" htmlFor="contato-responsavel">
                  <Selecao
                    id="contato-responsavel"
                    value={responsavelId}
                    onChange={(evento) => definirResponsavel(evento.target.value)}
                  >
                    <option value="">Ninguém</option>
                    {atendentes.map((atendente) => (
                      <option key={atendente.id} value={atendente.id}>
                        {atendente.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>

                <Campo rotulo="Departamento" htmlFor="contato-departamento">
                  <Selecao
                    id="contato-departamento"
                    value={departamentoId}
                    onChange={(evento) => definirDepartamento(evento.target.value)}
                  >
                    <option value="">Nenhum</option>
                    {departamentos.map((departamento) => (
                      <option key={departamento.id} value={departamento.id}>
                        {departamento.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>

                <Campo rotulo="Situação">
                  <label className="flex h-9 items-center gap-2.5 text-[13.5px] text-tinta-900">
                    <input
                      type="checkbox"
                      checked={ehCliente}
                      onChange={(evento) => definirEhCliente(evento.target.checked)}
                      className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
                    />
                    Já é cliente
                  </label>
                </Campo>
              </div>

              {campos.length ? (
                <div className="border-t border-bruma-100 pt-4">
                  <p className="mb-3 text-[13px] font-medium text-tinta-800">Campos do negócio</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {campos.map(({ campo }) => {
                      const opcoes = Array.isArray(campo.opcoes)
                        ? (campo.opcoes as unknown[]).map(String)
                        : [];

                      return (
                        <Campo key={campo.id} rotulo={campo.rotulo} htmlFor={`campo-${campo.chave}`}>
                          {campo.tipo === 'SELECAO' && opcoes.length ? (
                            <Selecao
                              id={`campo-${campo.chave}`}
                              value={valores[campo.chave] ?? ''}
                              onChange={(evento) =>
                                definirValores((atuais) => ({
                                  ...atuais,
                                  [campo.chave]: evento.target.value,
                                }))
                              }
                            >
                              <option value="">Não informado</option>
                              {opcoes.map((opcao) => (
                                <option key={opcao} value={opcao}>
                                  {opcao}
                                </option>
                              ))}
                            </Selecao>
                          ) : campo.tipo === 'TEXTO_LONGO' ? (
                            <AreaTexto
                              id={`campo-${campo.chave}`}
                              value={valores[campo.chave] ?? ''}
                              onChange={(evento) =>
                                definirValores((atuais) => ({
                                  ...atuais,
                                  [campo.chave]: evento.target.value,
                                }))
                              }
                              rows={2}
                              maxLength={500}
                            />
                          ) : (
                            <Entrada
                              id={`campo-${campo.chave}`}
                              value={valores[campo.chave] ?? ''}
                              onChange={(evento) =>
                                definirValores((atuais) => ({
                                  ...atuais,
                                  [campo.chave]: evento.target.value,
                                }))
                              }
                              maxLength={500}
                            />
                          )}
                        </Campo>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Campo
                rotulo="Observações internas"
                htmlFor="contato-observacoes"
                ajuda="Vai junto no contexto da IA. O cliente nunca vê."
              >
                <AreaTexto
                  id="contato-observacoes"
                  value={observacoes}
                  onChange={(evento) => definirObservacoes(evento.target.value)}
                  rows={3}
                  maxLength={4000}
                />
              </Campo>
            </CorpoCartao>

            <RodapeCartao>
              <Botao type="submit" carregando={salvando}>
                Salvar
              </Botao>
            </RodapeCartao>
          </Cartao>
        </form>

        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Conversas</TituloCartao>
            <DescricaoCartao>Histórico completo deste contato.</DescricaoCartao>
          </CabecalhoCartao>
          <CorpoCartao>
            {conversas.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-bruma-600">Nenhuma conversa registrada.</p>
            ) : (
              <ul className="space-y-2">
                {conversas.map((conversa) => (
                  <li key={conversa.id}>
                    <Link
                      href={`/atendimento?conversa=${conversa.id}`}
                      className="flex items-start gap-3 rounded-lg border border-bruma-200 px-3 py-2.5 transition-colors hover:bg-bruma-50"
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-bruma-500" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Selo tom={conversa.estado === 'ENCERRADA' ? 'neutro' : 'produto'}>
                            {rotuloEstado[conversa.estado]}
                          </Selo>
                          <span className="text-[12px] text-bruma-500">
                            {formatarDataHora(conversa.iniciada_em)}
                            {conversa.encerrada_em
                              ? ` — ${formatarDataHora(conversa.encerrada_em)}`
                              : ''}
                          </span>
                          {conversa.campanha_id ? <Selo tom="alerta">de campanha</Selo> : null}
                        </span>
                        <span className="mt-1 line-clamp-1 block text-[13px] text-tinta-800">
                          {conversa.ultima_mensagem_previa ?? 'Sem mensagens'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CorpoCartao>
        </Cartao>
      </div>

      <div className="space-y-4">
        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Etiquetas</TituloCartao>
          </CabecalhoCartao>
          <CorpoCartao>
            {etiquetas.length === 0 ? (
              <p className="text-[13px] text-bruma-600">Nenhuma etiqueta cadastrada.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((etiqueta) => {
                  const ativa = etiquetasAtivas.includes(etiqueta.id);
                  return (
                    <button
                      key={etiqueta.id}
                      type="button"
                      onClick={async () => {
                        const resultado = await alternarEtiquetaContato(
                          contato.id,
                          etiqueta.id,
                          !ativa,
                        );
                        if (!resultado.ok) {
                          toast.error(resultado.erro ?? 'Não foi possível alterar.');
                          return;
                        }
                        roteador.refresh();
                      }}
                      aria-pressed={ativa}
                      className={cn(
                        'rounded-lg border px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                        ativa ? 'text-white' : 'bg-white text-tinta-700 hover:bg-bruma-50',
                      )}
                      style={
                        ativa
                          ? { backgroundColor: etiqueta.cor, borderColor: etiqueta.cor }
                          : { borderColor: '#e2e5ea' }
                      }
                    >
                      {etiqueta.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </CorpoCartao>
        </Cartao>

        {contato.resumo ? (
          <Cartao>
            <CabecalhoCartao>
              <TituloCartao>Resumo da IA</TituloCartao>
              {contato.resumo_atualizado_em ? (
                <DescricaoCartao>
                  Atualizado {tempoRelativo(contato.resumo_atualizado_em)}.
                </DescricaoCartao>
              ) : null}
            </CabecalhoCartao>
            <CorpoCartao>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-tinta-800">
                {contato.resumo}
              </p>
            </CorpoCartao>
          </Cartao>
        ) : null}

        {memorias.length ? (
          <Cartao>
            <CabecalhoCartao>
              <TituloCartao className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" aria-hidden />
                Memória
              </TituloCartao>
              <DescricaoCartao>Fatos que a IA leva para as próximas conversas.</DescricaoCartao>
            </CabecalhoCartao>
            <CorpoCartao>
              <ul className="space-y-2">
                {memorias.map((memoria) => (
                  <li key={memoria.id} className="text-[12.5px] leading-relaxed">
                    <span className="font-medium text-tinta-800">{memoria.chave}: </span>
                    <span className="text-bruma-600">{memoria.conteudo}</span>
                    <span className="ml-1 text-[11px] text-bruma-500">({memoria.tipo.toLowerCase()})</span>
                  </li>
                ))}
              </ul>
            </CorpoCartao>
          </Cartao>
        ) : null}

        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Preferências de contato</TituloCartao>
          </CabecalhoCartao>
          <CorpoCartao className="space-y-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={contato.aceita_campanha}
                onChange={async (evento) => {
                  const resultado = await definirAceiteCampanha(contato.id, evento.target.checked);
                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível alterar.');
                    return;
                  }
                  toast.success(
                    evento.target.checked
                      ? 'Contato voltou a receber campanhas.'
                      : 'Contato removido das campanhas.',
                  );
                  roteador.refresh();
                }}
                className="mt-0.5 h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
              />
              <span>
                <span className="block text-[13px] font-medium text-tinta-900">Aceita campanhas</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-bruma-600">
                  Desmarcado, nenhuma campanha volta a incluir este contato — a conferência acontece na
                  hora do envio.
                </span>
              </span>
            </label>

            {contato.opt_out_em ? (
              <p className="text-[12px] text-bruma-500">
                Saiu das campanhas em {formatarDataHora(contato.opt_out_em)}
                {contato.opt_out_motivo ? ` — ${contato.opt_out_motivo}` : ''}.
              </p>
            ) : null}

            <label className="flex items-start gap-2.5 border-t border-bruma-100 pt-3">
              <input
                type="checkbox"
                checked={contato.bloqueado}
                onChange={async (evento) => {
                  const resultado = await definirBloqueio(contato.id, evento.target.checked);
                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível alterar.');
                    return;
                  }
                  roteador.refresh();
                }}
                className="mt-0.5 h-4 w-4 rounded border-bruma-400 text-marca-500 focus:ring-marca-500"
              />
              <span>
                <span className="block text-[13px] font-medium text-tinta-900">Bloquear contato</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-bruma-600">
                  Mensagens recebidas deste número passam a ser descartadas, e nada é enviado a ele.
                </span>
              </span>
            </label>
          </CorpoCartao>
        </Cartao>
      </div>
    </div>
  );
}
