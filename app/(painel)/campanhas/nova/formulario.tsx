'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, Plus, Trash2 } from 'lucide-react';
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
import type { StatusCanal } from '@/lib/tipos-banco';
import { criarCampanha, preverMensagem } from '../acoes';

const DIAS = [
  { valor: 1, rotulo: 'Seg' },
  { valor: 2, rotulo: 'Ter' },
  { valor: 3, rotulo: 'Qua' },
  { valor: 4, rotulo: 'Qui' },
  { valor: 5, rotulo: 'Sex' },
  { valor: 6, rotulo: 'Sáb' },
  { valor: 7, rotulo: 'Dom' },
];

export function FormularioCampanha({
  canais,
  departamentos,
  campos,
}: {
  canais: { id: string; nome: string; status: StatusCanal; ativo: boolean }[];
  departamentos: { id: string; nome: string }[];
  campos: { chave: string; rotulo: string }[];
}) {
  const roteador = useRouter();
  const [nome, definirNome] = React.useState('');
  const [descricao, definirDescricao] = React.useState('');
  const [canalId, definirCanal] = React.useState(canais[0]?.id ?? '');
  const [departamentoId, definirDepartamento] = React.useState('');
  const [mensagem, definirMensagem] = React.useState('');
  const [variacoes, definirVariacoes] = React.useState<string[]>([]);
  const [intervaloMinimo, definirIntervaloMinimo] = React.useState(45);
  const [intervaloMaximo, definirIntervaloMaximo] = React.useState(90);
  const [janelaInicio, definirJanelaInicio] = React.useState('09:00');
  const [janelaFim, definirJanelaFim] = React.useState('18:00');
  const [diasSemana, definirDiasSemana] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [limiteDiario, definirLimiteDiario] = React.useState(200);
  const [iaAssume, definirIaAssume] = React.useState(true);
  const [salvando, definirSalvando] = React.useState(false);
  const [previa, definirPrevia] = React.useState<{ texto: string; faltando: string[] } | null>(null);

  const canalEscolhido = canais.find((canal) => canal.id === canalId);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    definirSalvando(true);
    try {
      const resultado = await criarCampanha({
        nome,
        descricao: descricao.trim() || null,
        canalId,
        departamentoId: departamentoId || null,
        mensagem,
        variacoes: variacoes.filter((texto) => texto.trim().length >= 10),
        intervaloMinimo,
        intervaloMaximo,
        janelaInicio,
        janelaFim,
        diasSemana,
        limiteDiario,
        iaAssumeResposta: iaAssume,
      });

      if (!resultado.ok || !resultado.campanhaId) {
        toast.error(resultado.erro ?? 'Não foi possível criar.');
        return;
      }

      toast.success('Campanha criada. Agora adicione os destinatários.');
      roteador.push(`/campanhas/${resultado.campanhaId}`);
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <form onSubmit={criar} className="mt-5 space-y-4">
      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>O básico</TituloCartao>
        </CabecalhoCartao>
        <CorpoCartao className="space-y-4">
          <Campo rotulo="Nome" htmlFor="camp-nome" obrigatorio>
            <Entrada
              id="camp-nome"
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              maxLength={120}
              placeholder="Retomada de leads de julho"
              required
            />
          </Campo>

          <Campo rotulo="Descrição" htmlFor="camp-descricao">
            <Entrada
              id="camp-descricao"
              value={descricao}
              onChange={(evento) => definirDescricao(evento.target.value)}
              maxLength={500}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Canal de envio" htmlFor="camp-canal" obrigatorio>
              <Selecao
                id="camp-canal"
                value={canalId}
                onChange={(evento) => definirCanal(evento.target.value)}
                required
              >
                {canais.map((canal) => (
                  <option key={canal.id} value={canal.id}>
                    {canal.nome}
                    {canal.status !== 'CONECTADO' ? ' (desconectado)' : ''}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo
              rotulo="Departamento das respostas"
              htmlFor="camp-departamento"
              ajuda="Quem responder cai neste departamento."
            >
              <Selecao
                id="camp-departamento"
                value={departamentoId}
                onChange={(evento) => definirDepartamento(evento.target.value)}
              >
                <option value="">Deixar a IA decidir</option>
                {departamentos.map((departamento) => (
                  <option key={departamento.id} value={departamento.id}>
                    {departamento.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>

          {canalEscolhido && canalEscolhido.status !== 'CONECTADO' ? (
            <p className="rounded-lg bg-alerta-100/50 px-3 py-2 text-[12.5px] text-alerta-700">
              Este canal não está conectado. Dá para criar a campanha agora, mas ela só inicia com o
              número conectado.
            </p>
          ) : null}
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>A mensagem</TituloCartao>
          <DescricaoCartao>
            Use variáveis para personalizar. Se um contato não tiver o dado, ele é pulado e registrado
            como ignorado — melhor do que enviar “Olá , tudo bem?”.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-4">
          <Campo rotulo="Mensagem" htmlFor="camp-mensagem" obrigatorio>
            <AreaTexto
              id="camp-mensagem"
              value={mensagem}
              onChange={(evento) => definirMensagem(evento.target.value)}
              rows={5}
              maxLength={2000}
              required
              placeholder="Olá {{primeiro_nome|tudo bem}}, aqui é da [empresa]. Você chegou a avaliar…"
            />
          </Campo>

          <div className="rounded-lg border border-bruma-200 bg-bruma-50 px-3 py-2.5">
            <p className="text-[12px] font-medium text-tinta-800">Variáveis disponíveis</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { chave: 'nome', rotulo: 'Nome completo' },
                { chave: 'primeiro_nome', rotulo: 'Primeiro nome' },
                { chave: 'telefone', rotulo: 'Telefone' },
                ...campos,
              ].map((campo) => (
                <button
                  key={campo.chave}
                  type="button"
                  onClick={() => definirMensagem((atual) => `${atual}{{${campo.chave}}}`)}
                  className="rounded-lg border border-bruma-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-tinta-700 hover:bg-bruma-100"
                  title={campo.rotulo}
                >
                  {`{{${campo.chave}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-bruma-600">
              Para um valor de reserva quando o dado faltar, escreva{' '}
              <code className="rounded bg-white px-1">{'{{primeiro_nome|tudo bem}}'}</code>.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-tinta-800">
                Variações para teste A/B ({variacoes.length}/5)
              </span>
              {variacoes.length < 5 ? (
                <Botao
                  type="button"
                  variante="suave"
                  tamanho="pequeno"
                  onClick={() => definirVariacoes((atuais) => [...atuais, ''])}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Adicionar
                </Botao>
              ) : null}
            </div>

            <p className="mb-2 text-[12px] leading-relaxed text-bruma-600">
              Cada contato recebe sempre a mesma variação, então a comparação entre elas é honesta.
              Variações servem para medir o que converte — não para escapar de filtro de spam.
            </p>

            {variacoes.map((texto, indice) => (
              <div key={indice} className="mb-2 flex gap-2">
                <AreaTexto
                  value={texto}
                  onChange={(evento) =>
                    definirVariacoes((atuais) =>
                      atuais.map((item, i) => (i === indice ? evento.target.value : item)),
                    )
                  }
                  rows={3}
                  maxLength={2000}
                  placeholder={`Variação ${indice + 1}`}
                />
                <Botao
                  type="button"
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover variação ${indice + 1}`}
                  onClick={() =>
                    definirVariacoes((atuais) => atuais.filter((_, i) => i !== indice))
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Botao>
              </div>
            ))}
          </div>

          <div>
            <Botao
              type="button"
              variante="secundario"
              tamanho="pequeno"
              disabled={mensagem.trim().length < 10}
              onClick={async () => {
                const resultado = await preverMensagem({ mensagem });
                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível gerar a prévia.');
                  return;
                }
                definirPrevia({ texto: resultado.texto ?? '', faltando: resultado.faltando ?? [] });
              }}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Ver prévia com um contato real
            </Botao>

            {previa ? (
              <div className="mt-2 rounded-lg border border-bruma-200 bg-white px-3 py-2.5">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-tinta-800">
                  {previa.texto}
                </p>
                {previa.faltando.length ? (
                  <p className="mt-2 text-[12px] text-alerta-700">
                    Faltou valor para: {previa.faltando.join(', ')}. Contatos sem esses dados serão
                    pulados.
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] text-sucesso-700">
                    Todas as variáveis foram preenchidas neste contato.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Ritmo e horário</TituloCartao>
          <DescricaoCartao>
            O envio é espaçado e respeita a janela. É o que faz a campanha parecer atendimento, e não
            disparo em massa.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Intervalo mínimo (segundos)"
              htmlFor="camp-min"
              ajuda="Abaixo de 30 s o número fica exposto a bloqueio."
            >
              <Entrada
                id="camp-min"
                type="number"
                min={5}
                max={3600}
                value={intervaloMinimo}
                onChange={(evento) => definirIntervaloMinimo(Number(evento.target.value))}
              />
            </Campo>

            <Campo rotulo="Intervalo máximo (segundos)" htmlFor="camp-max">
              <Entrada
                id="camp-max"
                type="number"
                min={5}
                max={7200}
                value={intervaloMaximo}
                onChange={(evento) => definirIntervaloMaximo(Number(evento.target.value))}
              />
            </Campo>

            <Campo rotulo="Começa às" htmlFor="camp-inicio">
              <Entrada
                id="camp-inicio"
                type="time"
                value={janelaInicio}
                onChange={(evento) => definirJanelaInicio(evento.target.value)}
              />
            </Campo>

            <Campo rotulo="Para às" htmlFor="camp-fim">
              <Entrada
                id="camp-fim"
                type="time"
                value={janelaFim}
                onChange={(evento) => definirJanelaFim(evento.target.value)}
              />
            </Campo>

            <Campo rotulo="Limite por dia" htmlFor="camp-limite">
              <Entrada
                id="camp-limite"
                type="number"
                min={1}
                max={5000}
                value={limiteDiario}
                onChange={(evento) => definirLimiteDiario(Number(evento.target.value))}
              />
            </Campo>
          </div>

          <Campo rotulo="Dias da semana">
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((dia) => {
                const ativo = diasSemana.includes(dia.valor);
                return (
                  <button
                    key={dia.valor}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() =>
                      definirDiasSemana((atuais) =>
                        ativo ? atuais.filter((item) => item !== dia.valor) : [...atuais, dia.valor],
                      )
                    }
                    className={
                      ativo
                        ? 'rounded-lg border border-produto-700 bg-produto-700 px-3 py-1 text-[13px] font-medium text-white'
                        : 'rounded-lg border border-bruma-300 bg-white px-3 py-1 text-[13px] font-medium text-tinta-700 hover:bg-bruma-50'
                    }
                  >
                    {dia.rotulo}
                  </button>
                );
              })}
            </div>
          </Campo>

          <label className="flex items-start gap-2.5 rounded-lg border border-bruma-200 px-3 py-2.5">
            <input
              type="checkbox"
              checked={iaAssume}
              onChange={(evento) => definirIaAssume(evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
            />
            <span>
              <span className="block text-[13.5px] font-medium text-tinta-900">
                A IA responde quem responder
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-bruma-600">
                É o que fecha o ciclo do repique: o lead responde, a IA retoma com todo o histórico e
                qualifica antes de chamar um consultor. Desmarcado, a conversa vai direto para a fila
                humana.
              </span>
            </span>
          </label>

          <div className="rounded-lg border border-bruma-200 bg-bruma-50 px-3 py-2.5">
            <Selo tom="neutro">respeito ao opt-out</Selo>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-bruma-600">
              Contatos marcados como “não aceita campanhas” ou bloqueados nunca entram — a conferência
              acontece na montagem da lista e de novo na hora de cada envio.
            </p>
          </div>
        </CorpoCartao>

        <RodapeCartao>
          <Botao type="submit" carregando={salvando} disabled={!canalId || mensagem.trim().length < 10}>
            Criar campanha
          </Botao>
        </RodapeCartao>
      </Cartao>
    </form>
  );
}
