import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  CabecalhoPagina,
  Cartao,
  CorpoCartao,
  CabecalhoCartao,
  TituloCartao,
  DescricaoCartao,
  EstadoVazio,
  Indicador,
  Selo,
} from '@/componentes/ui/estrutura';
import { formatarDuracao, formatarNumero } from '@/lib/utilitarios';
import { PeriodoPainel } from './periodo';

export const metadata: Metadata = { title: 'Painel' };
export const dynamic = 'force-dynamic';

const PERIODOS = {
  hoje: { rotulo: 'Hoje', dias: 0 },
  '7dias': { rotulo: '7 dias', dias: 7 },
  '30dias': { rotulo: '30 dias', dias: 30 },
} as const;

type ChavePeriodo = keyof typeof PERIODOS;

interface Indicadores {
  conversas_no_periodo: number;
  conversas_abertas: number;
  aguardando_humano: number;
  ia_atendendo: number;
  humanos_atendendo: number;
  aguardando_cliente: number;
  encerradas_no_periodo: number;
  nao_atribuidas: number;
  segundos_ate_primeira_resposta: number;
  segundos_ate_primeira_resposta_humana: number;
  contatos_novos: number;
  mensagens_recebidas: number;
  mensagens_enviadas: number;
  transferencias: number;
  campanhas_em_execucao: number;
  campanha_mensagens_enviadas: number;
  campanha_respostas: number;
  por_departamento: { id: string; nome: string; cor: string; abertas: number }[];
  volume_por_dia: { dia: string; recebidas: number; enviadas: number }[];
}

const VAZIO: Indicadores = {
  conversas_no_periodo: 0,
  conversas_abertas: 0,
  aguardando_humano: 0,
  ia_atendendo: 0,
  humanos_atendendo: 0,
  aguardando_cliente: 0,
  encerradas_no_periodo: 0,
  nao_atribuidas: 0,
  segundos_ate_primeira_resposta: 0,
  segundos_ate_primeira_resposta_humana: 0,
  contatos_novos: 0,
  mensagens_recebidas: 0,
  mensagens_enviadas: 0,
  transferencias: 0,
  campanhas_em_execucao: 0,
  campanha_mensagens_enviadas: 0,
  campanha_respostas: 0,
  por_departamento: [],
  volume_por_dia: [],
};

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirSessao();
  const parametros = await searchParams;

  const bruto = Array.isArray(parametros.periodo) ? parametros.periodo[0] : parametros.periodo;
  const chave: ChavePeriodo = bruto && bruto in PERIODOS ? (bruto as ChavePeriodo) : '7dias';

  const fim = new Date();
  const inicio = new Date();
  if (PERIODOS[chave].dias === 0) inicio.setHours(0, 0, 0, 0);
  else inicio.setDate(inicio.getDate() - PERIODOS[chave].dias);

  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc('indicadores_painel', {
    p_organizacao_id: sessao.organizacao.id,
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
  });

  // Sem dados, os números são zero de verdade — nada de valor de exemplo.
  const indicadores: Indicadores =
    !error && data && typeof data === 'object' && !Array.isArray(data)
      ? { ...VAZIO, ...(data as unknown as Indicadores) }
      : VAZIO;

  const semNada =
    indicadores.conversas_no_periodo === 0 &&
    indicadores.conversas_abertas === 0 &&
    indicadores.mensagens_recebidas === 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <CabecalhoPagina
        titulo="Painel"
        descricao={`Como está a operação de ${sessao.organizacao.nome}.`}
        acoes={<PeriodoPainel atual={chave} />}
      />

      {error ? (
        <Cartao className="mb-4 border-marca-50 bg-marca-50/50">
          <CorpoCartao>
            <p className="text-[13px] leading-relaxed text-marca-600">
              Não foi possível carregar os indicadores: {error.message}. Se o banco acabou de ser criado,
              rode <code className="font-semibold">npm run banco:aplicar</code>.
            </p>
          </CorpoCartao>
        </Cartao>
      ) : null}

      {semNada ? (
        <Cartao>
          <EstadoVazio
            titulo="Ainda não há movimento para medir"
            descricao="Os números aparecem sozinhos assim que as primeiras conversas entrarem. Nada aqui é exemplo: enquanto não houver atendimento, tudo fica em zero."
            acao={
              <Link
                href="/configuracoes/canais"
                className="text-[13.5px] font-medium text-produto-700 underline-offset-4 hover:underline"
              >
                Conectar um número de WhatsApp
              </Link>
            }
          />
        </Cartao>
      ) : null}

      <section aria-label="Situação agora" className="mt-2">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-bruma-500">
          Agora
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Conversas abertas" valor={formatarNumero(indicadores.conversas_abertas)} />
          <Indicador
            rotulo="Aguardando humano"
            valor={formatarNumero(indicadores.aguardando_humano)}
            detalhe={indicadores.aguardando_humano > 0 ? 'precisa de alguém agora' : 'fila limpa'}
            tom={indicadores.aguardando_humano > 0 ? 'alerta' : 'neutro'}
          />
          <Indicador rotulo="IA atendendo" valor={formatarNumero(indicadores.ia_atendendo)} tom="ia" />
          <Indicador
            rotulo="Em atendimento humano"
            valor={formatarNumero(indicadores.humanos_atendendo)}
            tom="produto"
          />
          <Indicador
            rotulo="Aguardando cliente"
            valor={formatarNumero(indicadores.aguardando_cliente)}
          />
          <Indicador
            rotulo="Sem responsável"
            valor={formatarNumero(indicadores.nao_atribuidas)}
            detalhe={indicadores.nao_atribuidas > 0 ? 'ninguém assumiu' : undefined}
          />
          <Indicador
            rotulo="Campanhas rodando"
            valor={formatarNumero(indicadores.campanhas_em_execucao)}
          />
          <Indicador rotulo="Contatos novos" valor={formatarNumero(indicadores.contatos_novos)} />
        </div>
      </section>

      <section aria-label="Período" className="mt-7">
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-bruma-500">
          No período ({PERIODOS[chave].rotulo.toLowerCase()})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Atendimentos iniciados"
            valor={formatarNumero(indicadores.conversas_no_periodo)}
          />
          <Indicador
            rotulo="Atendimentos encerrados"
            valor={formatarNumero(indicadores.encerradas_no_periodo)}
          />
          <Indicador
            rotulo="Tempo até a 1ª resposta"
            valor={formatarDuracao(indicadores.segundos_ate_primeira_resposta)}
            detalhe="qualquer resposta, IA ou humano"
          />
          <Indicador
            rotulo="Tempo até um humano"
            valor={formatarDuracao(indicadores.segundos_ate_primeira_resposta_humana)}
            detalhe="quando houve atendimento humano"
          />
          <Indicador
            rotulo="Mensagens recebidas"
            valor={formatarNumero(indicadores.mensagens_recebidas)}
          />
          <Indicador rotulo="Mensagens enviadas" valor={formatarNumero(indicadores.mensagens_enviadas)} />
          <Indicador rotulo="Transferências" valor={formatarNumero(indicadores.transferencias)} />
          <Indicador
            rotulo="Respostas de campanha"
            valor={formatarNumero(indicadores.campanha_respostas)}
            detalhe={`de ${formatarNumero(indicadores.campanha_mensagens_enviadas)} enviadas`}
          />
        </div>
      </section>

      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Conversas abertas por departamento</TituloCartao>
            <DescricaoCartao>Onde a fila está parada agora.</DescricaoCartao>
          </CabecalhoCartao>
          <CorpoCartao>
            {indicadores.por_departamento.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-bruma-600">
                Nenhum departamento cadastrado.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {indicadores.por_departamento.map((departamento) => {
                  const maior = Math.max(
                    ...indicadores.por_departamento.map((item) => item.abertas),
                    1,
                  );
                  const largura = Math.round((departamento.abertas / maior) * 100);

                  return (
                    <li key={departamento.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[13px] text-tinta-800">{departamento.nome}</span>
                        <span className="text-[13px] font-semibold tabular-nums text-tinta-900">
                          {formatarNumero(departamento.abertas)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bruma-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${departamento.abertas > 0 ? Math.max(largura, 4) : 0}%`,
                            backgroundColor: departamento.cor,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CorpoCartao>
        </Cartao>

        <Cartao>
          <CabecalhoCartao>
            <TituloCartao>Volume de mensagens por dia</TituloCartao>
            <DescricaoCartao>Recebidas e enviadas no período.</DescricaoCartao>
          </CabecalhoCartao>
          <CorpoCartao>
            {indicadores.volume_por_dia.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-bruma-600">
                Nenhuma mensagem no período.
              </p>
            ) : (
              <GraficoVolume dados={indicadores.volume_por_dia} />
            )}
          </CorpoCartao>
        </Cartao>
      </div>
    </div>
  );
}

/**
 * Gráfico de barras em HTML puro.
 *
 * Uma biblioteca de gráficos custaria uns 100 KB no navegador para
 * desenhar duas séries de barras. Com `div` e altura percentual o
 * resultado é o mesmo, responsivo e legível por leitor de tela através da
 * tabela de valores.
 */
function GraficoVolume({ dados }: { dados: { dia: string; recebidas: number; enviadas: number }[] }) {
  const maior = Math.max(...dados.flatMap((item) => [item.recebidas, item.enviadas]), 1);

  return (
    <div>
      <div className="flex items-end gap-1.5 overflow-x-auto rolagem-fina pb-2" style={{ height: 160 }}>
        {dados.map((item) => (
          <div key={item.dia} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
            <div className="flex h-[120px] w-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 rounded-t bg-tinta-800"
                style={{ height: `${Math.max((item.recebidas / maior) * 100, item.recebidas ? 3 : 0)}%` }}
                title={`${item.recebidas} recebidas`}
              />
              <div
                className="w-1/2 rounded-t bg-produto-700"
                style={{ height: `${Math.max((item.enviadas / maior) * 100, item.enviadas ? 3 : 0)}%` }}
                title={`${item.enviadas} enviadas`}
              />
            </div>
            <span className="text-[10px] tabular-nums text-bruma-500">
              {item.dia.slice(8, 10)}/{item.dia.slice(5, 7)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-4 text-[12px] text-bruma-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-tinta-800" aria-hidden /> Recebidas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-produto-700" aria-hidden /> Enviadas
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] text-bruma-600 hover:text-tinta-800">
          Ver os números
        </summary>
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr className="text-left text-bruma-500">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Recebidas</th>
              <th className="py-1 text-right font-medium">Enviadas</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item) => (
              <tr key={item.dia} className="border-t border-bruma-100">
                <td className="py-1 text-tinta-800">{item.dia}</td>
                <td className="py-1 text-right tabular-nums text-tinta-800">{item.recebidas}</td>
                <td className="py-1 text-right tabular-nums text-tinta-800">{item.enviadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-bruma-500">
        <Selo tom="neutro">dados reais</Selo>
        Contados direto do banco no período escolhido.
      </p>
    </div>
  );
}
