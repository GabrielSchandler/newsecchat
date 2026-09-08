'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Lightbulb, Play, X } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  EstadoVazio,
  Selo,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import { formatarDataHora, formatarNumero } from '@/lib/utilitarios';
import type { ExecucaoAnaliseIa, StatusSugestao, SugestaoIa, TipoSugestao } from '@/lib/tipos-banco';
import { aprovarSugestao, iniciarAnalise, rejeitarSugestao } from '../acoes';

const ROTULO_TIPO: Record<TipoSugestao, string> = {
  INSTRUCAO: 'Instrução',
  BASE_CONHECIMENTO: 'Base de conhecimento',
  PERGUNTA: 'Pergunta',
  CAMPO: 'Campo',
  TRANSFERENCIA: 'Transferência',
  OBJECAO: 'Objeção',
};

const TOM_SUGESTAO: Record<StatusSugestao, 'alerta' | 'sucesso' | 'neutro' | 'produto'> = {
  PENDENTE: 'alerta',
  APROVADA: 'sucesso',
  REJEITADA: 'neutro',
  APLICADA: 'produto',
};

export function PainelAnalise({
  execucoes,
  sugestoes,
  podeRevisar,
  iaConfigurada,
}: {
  execucoes: ExecucaoAnaliseIa[];
  sugestoes: SugestaoIa[];
  podeRevisar: boolean;
  iaConfigurada: boolean;
}) {
  const roteador = useRouter();
  const [dias, definirDias] = React.useState(7);
  const [iniciando, definirIniciando] = React.useState(false);
  const [ocupado, definirOcupado] = React.useState<string | null>(null);

  const ultima = execucoes[0];
  const emAndamento = ultima?.status === 'PENDENTE' || ultima?.status === 'EXECUTANDO';
  const pendentes = sugestoes.filter((sugestao) => sugestao.status === 'PENDENTE');
  const revisadas = sugestoes.filter((sugestao) => sugestao.status !== 'PENDENTE');

  // Enquanto roda no worker, a página se atualiza sozinha.
  React.useEffect(() => {
    if (!emAndamento) return;
    const relogio = setInterval(() => roteador.refresh(), 8000);
    return () => clearInterval(relogio);
  }, [emAndamento, roteador]);

  return (
    <div className="space-y-4">
      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Analisar atendimentos</TituloCartao>
          <DescricaoCartao>
            A IA lê as conversas do período e aponta o que está falhando: pergunta sem resposta boa,
            ponto de abandono, objeção repetida. Cada achado vem com número de ocorrências e trechos
            reais — nada é aplicado sozinho.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="flex flex-wrap items-end gap-3">
          <div className="w-[200px]">
            <label htmlFor="analise-periodo" className="mb-1.5 block text-[13px] font-medium text-tinta-800">
              Período
            </label>
            <Selecao
              id="analise-periodo"
              value={String(dias)}
              onChange={(evento) => definirDias(Number(evento.target.value))}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="15">Últimos 15 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="60">Últimos 60 dias</option>
            </Selecao>
          </div>

          <Botao
            carregando={iniciando}
            disabled={!podeRevisar || emAndamento || !iaConfigurada}
            onClick={async () => {
              definirIniciando(true);
              try {
                const resultado = await iniciarAnalise(dias);
                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível iniciar.');
                  return;
                }
                toast.success('Análise iniciada. O resultado aparece aqui em alguns minutos.');
                roteador.refresh();
              } finally {
                definirIniciando(false);
              }
            }}
          >
            <Play className="h-4 w-4" aria-hidden />
            {emAndamento ? 'Analisando…' : 'Analisar atendimentos'}
          </Botao>

          {!podeRevisar ? (
            <p className="text-[12.5px] text-bruma-600">
              Só um administrador pode iniciar a análise.
            </p>
          ) : null}
        </CorpoCartao>
      </Cartao>

      {ultima ? (
        <Cartao>
          <CorpoCartao>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-tinta-900">Última análise</span>
              <Selo
                tom={
                  ultima.status === 'CONCLUIDA'
                    ? 'sucesso'
                    : ultima.status === 'FALHOU'
                      ? 'erro'
                      : 'alerta'
                }
              >
                {ultima.status === 'CONCLUIDA'
                  ? 'concluída'
                  : ultima.status === 'FALHOU'
                    ? 'falhou'
                    : 'em andamento'}
              </Selo>
              <span className="text-[12.5px] text-bruma-600">
                {formatarDataHora(ultima.iniciado_em)}
              </span>
            </div>

            {ultima.status === 'CONCLUIDA' ? (
              <>
                <p className="mt-1.5 text-[12.5px] text-bruma-600">
                  {formatarNumero(ultima.total_conversas)} conversa(s) e{' '}
                  {formatarNumero(ultima.total_mensagens)} mensagem(ns) analisadas.
                </p>
                {ultima.resumo ? (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bruma-50 px-3 py-2.5 text-[13px] leading-relaxed text-tinta-800">
                    {ultima.resumo}
                  </p>
                ) : null}
              </>
            ) : null}

            {ultima.status === 'FALHOU' && ultima.erro ? (
              <p className="mt-2 rounded-lg bg-marca-50 px-3 py-2 text-[13px] leading-relaxed text-marca-600">
                {ultima.erro}
              </p>
            ) : null}
          </CorpoCartao>
        </Cartao>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-bruma-500">
          Sugestões aguardando revisão ({pendentes.length})
        </h2>

        {pendentes.length === 0 ? (
          <Cartao>
            <EstadoVazio
              icone={<Lightbulb className="h-5 w-5" />}
              titulo="Nenhuma sugestão pendente"
              descricao="Rode uma análise para a IA apontar o que melhorar na configuração."
            />
          </Cartao>
        ) : (
          <div className="space-y-3">
            {pendentes.map((sugestao) => (
              <CartaoSugestao
                key={sugestao.id}
                sugestao={sugestao}
                podeRevisar={podeRevisar}
                ocupado={ocupado === sugestao.id}
                aoAprovar={async () => {
                  definirOcupado(sugestao.id);
                  try {
                    const resultado = await aprovarSugestao(sugestao.id);
                    if (!resultado.ok) {
                      toast.error(resultado.erro ?? 'Não foi possível aprovar.');
                      return;
                    }
                    toast.success(resultado.aviso ?? 'Sugestão aprovada.');
                    roteador.refresh();
                  } finally {
                    definirOcupado(null);
                  }
                }}
                aoRejeitar={async () => {
                  definirOcupado(sugestao.id);
                  try {
                    const resultado = await rejeitarSugestao(sugestao.id);
                    if (!resultado.ok) {
                      toast.error(resultado.erro ?? 'Não foi possível rejeitar.');
                      return;
                    }
                    toast.success('Sugestão rejeitada.');
                    roteador.refresh();
                  } finally {
                    definirOcupado(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {revisadas.length ? (
        <section>
          <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-bruma-500">
            Já revisadas
          </h2>
          <Cartao>
            <ul className="divide-y divide-bruma-100">
              {revisadas.map((sugestao) => (
                <li key={sugestao.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-tinta-900">{sugestao.titulo}</p>
                    <p className="mt-0.5 text-[12px] text-bruma-500">
                      {ROTULO_TIPO[sugestao.tipo]} ·{' '}
                      {sugestao.revisado_em ? formatarDataHora(sugestao.revisado_em) : ''}
                    </p>
                  </div>
                  <Selo tom={TOM_SUGESTAO[sugestao.status]}>{sugestao.status.toLowerCase()}</Selo>
                </li>
              ))}
            </ul>
          </Cartao>
        </section>
      ) : null}
    </div>
  );
}

function CartaoSugestao({
  sugestao,
  podeRevisar,
  ocupado,
  aoAprovar,
  aoRejeitar,
}: {
  sugestao: SugestaoIa;
  podeRevisar: boolean;
  ocupado: boolean;
  aoAprovar: () => Promise<void>;
  aoRejeitar: () => Promise<void>;
}) {
  const evidencias = Array.isArray(sugestao.evidencias)
    ? (sugestao.evidencias as unknown[]).map(String)
    : [];

  const proposta =
    sugestao.alteracao_proposta &&
    typeof sugestao.alteracao_proposta === 'object' &&
    !Array.isArray(sugestao.alteracao_proposta)
      ? (sugestao.alteracao_proposta as Record<string, unknown>)
      : {};

  const texto = typeof proposta.texto === 'string' ? proposta.texto : null;
  const campo = typeof proposta.campo === 'string' ? proposta.campo : null;

  return (
    <Cartao>
      <CorpoCartao>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14.5px] font-semibold text-tinta-900">{sugestao.titulo}</h3>
              <Selo tom="neutro">{ROTULO_TIPO[sugestao.tipo]}</Selo>
              {sugestao.ocorrencias > 0 ? (
                <Selo tom="produto">{sugestao.ocorrencias} ocorrência(s)</Selo>
              ) : null}
            </div>

            <p className="mt-1.5 text-[13px] leading-relaxed text-tinta-800">{sugestao.descricao}</p>
          </div>

          {podeRevisar ? (
            <div className="flex shrink-0 gap-1.5">
              <Botao tamanho="pequeno" disabled={ocupado} onClick={() => void aoAprovar()}>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Aprovar
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="pequeno"
                disabled={ocupado}
                onClick={() => void aoRejeitar()}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Rejeitar
              </Botao>
            </div>
          ) : null}
        </div>

        {texto ? (
          <div className="mt-3 rounded-lg border border-produto-100 bg-produto-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-produto-800">
              Texto sugerido{campo ? ` para "${campo}"` : ''}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tinta-800">{texto}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-produto-800">
              Aprovar acrescenta este texto num rascunho — não substitui o que já existe, e não vai ao ar
              até você publicar.
            </p>
          </div>
        ) : null}

        {evidencias.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12.5px] font-medium text-bruma-600 hover:text-tinta-800">
              Ver as {evidencias.length} evidência(s)
            </summary>
            <ul className="mt-2 space-y-1.5">
              {evidencias.map((evidencia, indice) => (
                <li
                  key={indice}
                  className="rounded-lg bg-bruma-50 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-tinta-700"
                >
                  “{evidencia}”
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CorpoCartao>
    </Cartao>
  );
}
