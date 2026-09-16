'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, FileEdit, Rocket } from 'lucide-react';
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
import { formatarDataHora } from '@/lib/utilitarios';
import type { AgenteIa, VersaoAgenteIa } from '@/lib/tipos-banco';
import { atualizarAgente, publicarVersao, salvarRascunho } from './acoes';

const MODELOS = [
  { valor: 'gpt-4o-mini', rotulo: 'gpt-4o-mini — rápido e barato (recomendado)' },
  { valor: 'gpt-4o', rotulo: 'gpt-4o — mais caro, melhor em casos difíceis' },
  { valor: 'gpt-4.1-mini', rotulo: 'gpt-4.1-mini' },
];

const DIAS = [
  { chave: '1', rotulo: 'Segunda' },
  { chave: '2', rotulo: 'Terça' },
  { chave: '3', rotulo: 'Quarta' },
  { chave: '4', rotulo: 'Quinta' },
  { chave: '5', rotulo: 'Sexta' },
  { chave: '6', rotulo: 'Sábado' },
  { chave: '7', rotulo: 'Domingo' },
];

interface Horarios {
  fuso?: string;
  dias?: Record<string, string[]>;
  fora_do_horario?: string;
}

function lerHorarios(valor: unknown): Horarios {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as Horarios;
  return {};
}

function lerLista(valor: unknown): string[] {
  return Array.isArray(valor) ? (valor as unknown[]).map(String) : [];
}

export function EditorAgente({
  agente,
  publicada,
  rascunho,
  campos,
  podeEditar,
}: {
  agente: AgenteIa;
  publicada: VersaoAgenteIa | null;
  rascunho: VersaoAgenteIa | null;
  campos: { chave: string; rotulo: string; obrigatorio_para_qualificacao: boolean }[];
  podeEditar: boolean;
}) {
  const roteador = useRouter();
  const base = rascunho ?? publicada;

  const [persona, definirPersona] = React.useState(base?.persona ?? '');
  const [nomeExibicao, definirNomeExibicao] = React.useState(base?.nome_exibicao ?? '');
  const [tom, definirTom] = React.useState(base?.tom ?? '');
  const [descricaoEmpresa, definirDescricao] = React.useState(base?.descricao_empresa ?? '');
  const [servicos, definirServicos] = React.useState(base?.servicos ?? '');
  const [baseConhecimento, definirBase] = React.useState(base?.base_conhecimento ?? '');
  const [objetivos, definirObjetivos] = React.useState(base?.objetivos ?? '');
  const [regras, definirRegras] = React.useState(base?.regras ?? '');
  const [limitacoes, definirLimitacoes] = React.useState(base?.limitacoes ?? '');
  const [proibidas, definirProibidas] = React.useState(base?.informacoes_proibidas ?? '');
  const [fallback, definirFallback] = React.useState(
    base?.mensagem_fallback ?? 'Vou chamar um atendente para te ajudar com isso.',
  );
  const [primeiraMensagem, definirPrimeiraMensagem] = React.useState(base?.primeira_mensagem ?? '');
  const [perguntas, definirPerguntas] = React.useState(lerLista(base?.perguntas).join('\n'));
  const [criterios, definirCriterios] = React.useState(
    lerLista(base?.criterios_transferencia).join('\n'),
  );

  const horariosIniciais = lerHorarios(base?.horarios);
  const [foraDoHorario, definirForaDoHorario] = React.useState(
    horariosIniciais.fora_do_horario ?? '',
  );
  const [diasAtivos, definirDiasAtivos] = React.useState<Record<string, [string, string] | null>>(
    () => {
      const inicial: Record<string, [string, string] | null> = {};
      for (const dia of DIAS) {
        const faixa = horariosIniciais.dias?.[dia.chave];
        inicial[dia.chave] =
          faixa && faixa.length >= 2 ? [faixa[0] as string, faixa[1] as string] : null;
      }
      return inicial;
    },
  );

  const [nomeAgente, definirNomeAgente] = React.useState(agente.nome);
  const [modelo, definirModelo] = React.useState(agente.modelo);
  const [temperatura, definirTemperatura] = React.useState(Number(agente.temperatura));
  const [maxSeguidas, definirMaxSeguidas] = React.useState(agente.max_mensagens_seguidas);
  const [ativo, definirAtivo] = React.useState(agente.ativo);

  const [salvando, definirSalvando] = React.useState(false);
  const [publicando, definirPublicando] = React.useState(false);

  function montarHorarios(): Record<string, unknown> {
    const dias: Record<string, string[]> = {};
    for (const [chave, faixa] of Object.entries(diasAtivos)) {
      if (faixa) dias[chave] = [faixa[0], faixa[1]];
    }
    return {
      fuso: horariosIniciais.fuso ?? 'America/Sao_Paulo',
      dias,
      fora_do_horario: foraDoHorario.trim(),
    };
  }

  async function salvar() {
    definirSalvando(true);
    try {
      const resultado = await salvarRascunho({
        agenteId: agente.id,
        conteudo: {
          persona,
          nomeExibicao: nomeExibicao.trim() || null,
          tom,
          descricaoEmpresa,
          servicos,
          baseConhecimento,
          objetivos,
          regras,
          limitacoes,
          informacoesProibidas: proibidas,
          mensagemFallback: fallback,
          primeiraMensagem,
          perguntas: perguntas.split('\n').map((linha) => linha.trim()).filter(Boolean),
          criteriosTransferencia: criterios
            .split('\n')
            .map((linha) => linha.trim())
            .filter(Boolean),
          horarios: montarHorarios(),
          notas: null,
        },
      });

      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível salvar.');
        return null;
      }

      toast.success('Rascunho salvo. Ele ainda não está no ar.');
      roteador.refresh();
      return resultado.versaoId ?? null;
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Cartao>
        <CorpoCartao className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-tinta-900">
                {publicada ? `Versão ${publicada.versao} no ar` : 'Nenhuma versão publicada'}
              </span>
              {publicada ? (
                <Selo tom="sucesso">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  publicada
                </Selo>
              ) : (
                <Selo tom="alerta">a IA não vai atender sem uma versão publicada</Selo>
              )}
              {rascunho ? (
                <Selo tom="alerta">
                  <FileEdit className="h-3 w-3" aria-hidden />
                  rascunho v{rascunho.versao} não publicado
                </Selo>
              ) : null}
            </div>
            {publicada?.publicado_em ? (
              <p className="mt-1 text-[12.5px] text-bruma-600">
                Publicada em {formatarDataHora(publicada.publicado_em)}.
              </p>
            ) : null}
          </div>

          {podeEditar && rascunho ? (
            <Botao
              carregando={publicando}
              onClick={async () => {
                definirPublicando(true);
                try {
                  const versaoId = await salvar();
                  const alvo = versaoId ?? rascunho.id;
                  const resultado = await publicarVersao(alvo);

                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível publicar.');
                    return;
                  }

                  if (resultado.aviso) toast.warning(resultado.aviso);
                  else toast.success('Versão publicada. A IA já está usando esta configuração.');

                  roteador.refresh();
                } finally {
                  definirPublicando(false);
                }
              }}
            >
              <Rocket className="h-4 w-4" aria-hidden />
              Publicar rascunho
            </Botao>
          ) : null}
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Quem é a IA</TituloCartao>
          <DescricaoCartao>
            Escreva como orientaria um atendente novo no primeiro dia. Quanto mais concreto, menos ela
            inventa.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-4">
          <Campo rotulo="Persona" htmlFor="ia-persona">
            <AreaTexto
              id="ia-persona"
              value={persona}
              onChange={(evento) => definirPersona(evento.target.value)}
              rows={2}
              disabled={!podeEditar}
              placeholder="Atendente do primeiro contato. Apresenta-se pelo nome da empresa."
            />
          </Campo>

          <Campo
            rotulo="Nome de exibição"
            htmlFor="ia-nome-exibicao"
            ajuda="Abre cada mensagem no WhatsApp, em negrito — ex.: Ana. Diferente do 'Nome do agente' lá embaixo, que é só o rótulo desta configuração aqui na tela; este é o nome que o cliente vê. Em branco, a mensagem sai sem nome na frente."
          >
            <Entrada
              id="ia-nome-exibicao"
              value={nomeExibicao}
              onChange={(evento) => definirNomeExibicao(evento.target.value)}
              disabled={!podeEditar}
              maxLength={60}
              placeholder="Ana"
            />
          </Campo>

          <Campo
            rotulo="Primeira mensagem"
            htmlFor="ia-primeira-mensagem"
            ajuda="Texto fixo, enviado sem passar pelo modelo — como um bot de saudação. Garante uma estreia sempre boa, em vez de a IA improvisar a cada conversa nova. Em branco, ela mesma escreve a primeira resposta, como qualquer outra."
          >
            <AreaTexto
              id="ia-primeira-mensagem"
              value={primeiraMensagem}
              onChange={(evento) => definirPrimeiraMensagem(evento.target.value)}
              rows={3}
              disabled={!podeEditar}
              maxLength={1000}
              placeholder="Oi! Eu sou a Ana, da GRS Soluções 👋 Ajudo a identificar se o seu contrato tem juros ou tarifas cobradas a mais — sem custo nessa etapa. Me conta rapidinho: o que te trouxe até aqui hoje?"
            />
          </Campo>

          <Campo rotulo="Tom de voz" htmlFor="ia-tom">
            <AreaTexto
              id="ia-tom"
              value={tom}
              onChange={(evento) => definirTom(evento.target.value)}
              rows={2}
              disabled={!podeEditar}
              placeholder="Cordial, direto e profissional. Frases curtas, sem gíria."
            />
          </Campo>

          <Campo
            rotulo="O que a empresa faz"
            htmlFor="ia-empresa"
            ajuda="Sem isto, a IA atende sem saber o que a empresa vende."
          >
            <AreaTexto
              id="ia-empresa"
              value={descricaoEmpresa}
              onChange={(evento) => definirDescricao(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo rotulo="Serviços" htmlFor="ia-servicos">
            <AreaTexto
              id="ia-servicos"
              value={servicos}
              onChange={(evento) => definirServicos(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo
            rotulo="Base de conhecimento"
            htmlFor="ia-base"
            ajuda="Perguntas frequentes e respostas. É daqui que a IA tira o que responder — o que não estiver escrito, ela não deve afirmar."
          >
            <AreaTexto
              id="ia-base"
              value={baseConhecimento}
              onChange={(evento) => definirBase(evento.target.value)}
              rows={8}
              disabled={!podeEditar}
            />
          </Campo>
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Como ela conduz a conversa</TituloCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-4">
          <Campo rotulo="Objetivos" htmlFor="ia-objetivos">
            <AreaTexto
              id="ia-objetivos"
              value={objetivos}
              onChange={(evento) => definirObjetivos(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo
            rotulo="Perguntas a cobrir"
            htmlFor="ia-perguntas"
            ajuda="Uma por linha. A ordem é sugestão: a IA encaixa cada uma quando fizer sentido, e não repete o que a pessoa já respondeu."
          >
            <AreaTexto
              id="ia-perguntas"
              value={perguntas}
              onChange={(evento) => definirPerguntas(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo rotulo="Regras da empresa" htmlFor="ia-regras">
            <AreaTexto
              id="ia-regras"
              value={regras}
              onChange={(evento) => definirRegras(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo
            rotulo="Limitações"
            htmlFor="ia-limitacoes"
            ajuda="O que ela nunca deve prometer ou afirmar."
          >
            <AreaTexto
              id="ia-limitacoes"
              value={limitacoes}
              onChange={(evento) => definirLimitacoes(evento.target.value)}
              rows={3}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo rotulo="Informações proibidas" htmlFor="ia-proibidas">
            <AreaTexto
              id="ia-proibidas"
              value={proibidas}
              onChange={(evento) => definirProibidas(evento.target.value)}
              rows={2}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo
            rotulo="Quando passar para uma pessoa"
            htmlFor="ia-criterios"
            ajuda="Um critério por linha. Os departamentos têm critérios próprios em Configurações > Departamentos."
          >
            <AreaTexto
              id="ia-criterios"
              value={criterios}
              onChange={(evento) => definirCriterios(evento.target.value)}
              rows={4}
              disabled={!podeEditar}
            />
          </Campo>

          <Campo rotulo="Mensagem ao transferir" htmlFor="ia-fallback">
            <Entrada
              id="ia-fallback"
              value={fallback}
              onChange={(evento) => definirFallback(evento.target.value)}
              maxLength={500}
              disabled={!podeEditar}
            />
          </Campo>

          {campos.length ? (
            <div className="rounded-lg border border-bruma-200 bg-bruma-50 px-3 py-2.5">
              <p className="text-[12.5px] font-medium text-tinta-800">
                Campos que a IA vai coletar nesta conversa
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {campos.map((campo) => (
                  <li key={campo.chave}>
                    <Selo tom={campo.obrigatorio_para_qualificacao ? 'produto' : 'neutro'}>
                      {campo.rotulo}
                      {campo.obrigatorio_para_qualificacao ? ' *' : ''}
                    </Selo>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-bruma-600">
                Editar esta lista é em Configurações &gt; Campos do contato. Os marcados com * são
                necessários para qualificar o lead.
              </p>
            </div>
          ) : null}
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Horário de atendimento</TituloCartao>
          <DescricaoCartao>
            Fora do horário, a IA continua conversando e coletando, mas avisa que o time responde depois
            — em vez de prometer retorno imediato.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-3">
          {DIAS.map((dia) => {
            const faixa = diasAtivos[dia.chave];
            return (
              <div key={dia.chave} className="flex flex-wrap items-center gap-3">
                <label className="flex w-[120px] items-center gap-2 text-[13.5px] text-tinta-900">
                  <input
                    type="checkbox"
                    checked={faixa !== null}
                    disabled={!podeEditar}
                    onChange={(evento) =>
                      definirDiasAtivos((atuais) => ({
                        ...atuais,
                        [dia.chave]: evento.target.checked ? ['08:00', '18:00'] : null,
                      }))
                    }
                    className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
                  />
                  {dia.rotulo}
                </label>

                {faixa ? (
                  <div className="flex items-center gap-2">
                    <Entrada
                      type="time"
                      value={faixa[0]}
                      disabled={!podeEditar}
                      onChange={(evento) =>
                        definirDiasAtivos((atuais) => ({
                          ...atuais,
                          [dia.chave]: [evento.target.value, faixa[1]],
                        }))
                      }
                      className="w-[110px]"
                      aria-label={`Início ${dia.rotulo}`}
                    />
                    <span className="text-[13px] text-bruma-500">às</span>
                    <Entrada
                      type="time"
                      value={faixa[1]}
                      disabled={!podeEditar}
                      onChange={(evento) =>
                        definirDiasAtivos((atuais) => ({
                          ...atuais,
                          [dia.chave]: [faixa[0], evento.target.value],
                        }))
                      }
                      className="w-[110px]"
                      aria-label={`Fim ${dia.rotulo}`}
                    />
                  </div>
                ) : (
                  <span className="text-[13px] text-bruma-500">sem atendimento</span>
                )}
              </div>
            );
          })}

          <Campo rotulo="O que dizer fora do horário" htmlFor="ia-fora-horario" className="pt-2">
            <AreaTexto
              id="ia-fora-horario"
              value={foraDoHorario}
              onChange={(evento) => definirForaDoHorario(evento.target.value)}
              rows={2}
              disabled={!podeEditar}
              placeholder="Nosso atendimento funciona de segunda a sexta, das 8h às 18h."
            />
          </Campo>
        </CorpoCartao>

        {podeEditar ? (
          <RodapeCartao>
            <Botao variante="secundario" carregando={salvando} onClick={() => void salvar()}>
              Salvar rascunho
            </Botao>
          </RodapeCartao>
        ) : null}
      </Cartao>

      {podeEditar ? (
        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Modelo e limites</TituloCartao>
            <DescricaoCartao>
              Isto vale na hora — não passa por rascunho, porque não muda o que a IA diz, só como ela é
              executada.
            </DescricaoCartao>
          </CabecalhoCartao>

          <CorpoCartao className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome do agente" htmlFor="agente-nome">
              <Entrada
                id="agente-nome"
                value={nomeAgente}
                onChange={(evento) => definirNomeAgente(evento.target.value)}
                maxLength={80}
              />
            </Campo>

            <Campo rotulo="Modelo" htmlFor="agente-modelo">
              <Selecao
                id="agente-modelo"
                value={modelo}
                onChange={(evento) => definirModelo(evento.target.value)}
              >
                {MODELOS.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo
              rotulo={`Criatividade: ${temperatura.toFixed(2)}`}
              htmlFor="agente-temperatura"
              ajuda="Perto de 0, respostas mais previsíveis. Acima de 0,7, mais variadas e menos confiáveis."
            >
              <input
                id="agente-temperatura"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperatura}
                onChange={(evento) => definirTemperatura(Number(evento.target.value))}
                className="w-full accent-produto-700"
              />
            </Campo>

            <Campo
              rotulo="Máximo de mensagens seguidas"
              htmlFor="agente-max"
              ajuda="Depois disso, sem o cliente responder, a conversa vai para uma pessoa."
            >
              <Entrada
                id="agente-max"
                type="number"
                min={1}
                max={5}
                value={maxSeguidas}
                onChange={(evento) => definirMaxSeguidas(Number(evento.target.value))}
              />
            </Campo>

            <label className="flex items-center gap-2.5 text-[13.5px] text-tinta-900">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(evento) => definirAtivo(evento.target.checked)}
                className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
              />
              Agente ativo
            </label>
          </CorpoCartao>

          <RodapeCartao>
            <Botao
              variante="secundario"
              onClick={async () => {
                const resultado = await atualizarAgente({
                  agenteId: agente.id,
                  nome: nomeAgente,
                  modelo,
                  temperatura,
                  maxMensagensSeguidas: maxSeguidas,
                  ativo,
                });

                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível salvar.');
                  return;
                }

                toast.success('Configuração do agente salva.');
                roteador.refresh();
              }}
            >
              Salvar
            </Botao>
          </RodapeCartao>
        </Cartao>
      ) : null}
    </div>
  );
}
