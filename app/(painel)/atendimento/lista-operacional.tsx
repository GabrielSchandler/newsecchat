'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownWideNarrow, Bot, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { FilaOperacional } from '@/lib/operacao/tipos';
import {
  FILTROS_ANTIGOS,
  contagemDoFiltro,
  ehFiltroAntigo,
  escoposDoPapel,
  filtrosDoEscopo,
  opcaoDoEscopo,
  type CaixaAtendimento,
  type ContagensAtendimento,
  type EscopoAtendimento,
} from '@/lib/operacao/atendimento';
import { iniciais, tempoRelativo } from '@/lib/utilitarios';
import { Situacao } from '@/componentes/operacao/compartilhados';
import type { PapelMembro } from '@/lib/tipos-banco';
import type { ApoioAtendimento } from './tipos';
import { definirConversaAbrindo, useConversaAbrindo } from './abrindo';

/**
 * Lista da tela de Atendimento.
 *
 * Responde duas perguntas, sempre visíveis, uma em cima da outra:
 *
 *   1. De quem é a conversa? — abas Meu atendimento / Equipe / IA (a IA só
 *      para supervisor, administrador e proprietário).
 *   2. O que falta fazer? — Novos, Não respondidos e Todos.
 *
 * Cada aba mostra o total do seu escopo, então dá para ver de relance onde
 * estão as conversas — inclusive quando "Meu atendimento" está vazio porque
 * quem está logado gerencia e não atende.
 */
export function ListaOperacional({
  itens,
  contagens,
  total,
  pagina,
  tamanho,
  apoio,
  escopo,
  caixa,
  papel,
}: {
  itens: FilaOperacional[];
  contagens: ContagensAtendimento | null;
  total: number | null;
  pagina: number;
  tamanho: number;
  apoio: ApoioAtendimento;
  escopo: EscopoAtendimento;
  caixa: CaixaAtendimento;
  papel: PapelMembro;
}) {
  const parametros = useSearchParams();
  const roteador = useRouter();
  const abrindo = useConversaAbrindo();
  const conversaAberta = parametros.get('conversa');

  // A conversa terminou de abrir: o destaque provisório sai.
  React.useEffect(() => {
    definirConversaAbrindo(null);
  }, [conversaAberta]);

  function url(mudancas: Record<string, string>) {
    const novos = new URLSearchParams(parametros.toString());

    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) novos.set(chave, valor);
      else novos.delete(chave);
    }

    return '/atendimento?' + novos.toString();
  }

  const opcaoEscopo = opcaoDoEscopo(escopo);
  const filtros = filtrosDoEscopo(escopo);
  const opcaoFiltro = filtros.find((item) => item.id === caixa);
  const abas = escoposDoPapel(papel);
  const filtroAntigo = ehFiltroAntigo(caixa) ? caixa : null;

  const inicio = itens.length ? (pagina - 1) * tamanho + 1 : 0;
  const fim = (pagina - 1) * tamanho + itens.length;
  // Sem total (contagens indisponíveis), a página seguinte existe se esta veio cheia.
  const temProxima = total !== null ? pagina * tamanho < total : itens.length === tamanho;

  return (
    <>
      <div className="px-3 pt-3">
        <h1 className="mb-2 text-lg font-semibold">Atendimento</h1>

        <nav
          aria-label="De quem são as conversas"
          className="grid gap-1 rounded-lg bg-bruma-50 p-1"
          style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}
        >
          {abas.map((aba) => {
            const numero = contagens ? (aba.id === 'ia' ? contagens.ia.todos : contagens[aba.id].todos) : null;

            return (
              <Link
                key={aba.id}
                href={url({ escopo: aba.id === 'meu' ? '' : aba.id, caixa: '', pagina: '' })}
                scroll={false}
                className="aba-escopo"
                aria-current={escopo === aba.id ? 'true' : undefined}
              >
                <span className="flex items-center gap-1">
                  {aba.id === 'ia' && <Bot size={12} aria-hidden />}
                  {aba.rotulo}
                </span>
                {numero !== null && <strong>{numero}</strong>}
              </Link>
            );
          })}
        </nav>

        <p className="mb-3 mt-2 text-[11px] leading-snug text-bruma-600">{opcaoEscopo.ajuda}</p>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            roteador.push(url({ busca: String(new FormData(evento.currentTarget).get('busca') || ''), pagina: '' }));
          }}
          className="relative"
        >
          <Search size={14} className="absolute left-2.5 top-2.5 text-bruma-600" />
          <input
            aria-label="Buscar nome ou telefone"
            name="busca"
            type="search"
            defaultValue={parametros.get('busca') || ''}
            key={parametros.get('busca') || ''}
            placeholder="Buscar nome ou telefone"
            className="campo-operacional !h-8 !pl-8"
          />
          <button type="submit" className="sr-only">
            Buscar
          </button>
        </form>

        <nav
          className="my-3 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${filtros.length}, minmax(0, 1fr))` }}
          aria-label="O que falta fazer"
        >
          {filtros.map((filtro) => {
            const numero = contagemDoFiltro(contagens, escopo, filtro.id);

            return (
              <Link
                key={filtro.id}
                href={url({ caixa: filtro.id === 'todos' ? '' : filtro.id, pagina: '' })}
                scroll={false}
                title={filtro.ajuda}
                className="filtro-fila"
                aria-current={caixa === filtro.id ? 'true' : undefined}
              >
                {filtro.rotulo}
                {numero !== null && <span className="rounded bg-black/5 px-1 text-[10px]">{numero}</span>}
              </Link>
            );
          })}
        </nav>

        {filtroAntigo && (
          <p className="mb-2 flex items-center justify-between gap-2 rounded bg-produto-50 px-2 py-1 text-[11px] text-produto-800">
            <span>Filtro: {FILTROS_ANTIGOS[filtroAntigo]}</span>
            <Link href={url({ caixa: '', pagina: '' })} scroll={false} aria-label="Remover filtro" className="rounded p-0.5 hover:bg-produto-100">
              <X size={12} />
            </Link>
          </p>
        )}

        {escopo !== 'ia' && (
          <div className="flex items-center gap-1 rounded border px-2">
            <ArrowDownWideNarrow size={14} aria-hidden />
            <select
              aria-label="Ordenação"
              className="h-8 min-w-0 flex-1 bg-white text-xs"
              value={parametros.get('ordem') || 'urgencia'}
              onChange={(evento) => roteador.push(url({ ordem: evento.target.value, pagina: '' }))}
            >
              <option value="urgencia">Mais urgentes primeiro</option>
              <option value="recentes">Atividade mais recente</option>
            </select>
          </div>
        )}

        <details className="my-2 text-[11px] text-bruma-600">
          <summary className="cursor-pointer py-1">Mais filtros</summary>
          <select
            aria-label="Filtrar equipe"
            className="campo-operacional my-2"
            value={parametros.get('equipe') || ''}
            onChange={(evento) => roteador.push(url({ equipe: evento.target.value, pagina: '' }))}
          >
            <option value="">Todas as equipes</option>
            {apoio.departamentos.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>
          <Link className="underline" href={url({ caixa: 'encerradas', pagina: '' })} scroll={false}>
            Ver concluídas
          </Link>
        </details>

        <p className="mb-2 text-[11px] text-bruma-600">
          {opcaoFiltro && <strong className="font-semibold text-tinta-800">{opcaoFiltro.rotulo}: </strong>}
          {total !== null ? `${total} ${total === 1 ? 'conversa' : 'conversas'}` : 'conversas'}
          {opcaoFiltro && opcaoFiltro.id !== 'todos' ? ` — ${opcaoFiltro.ajuda.toLowerCase()}` : ''}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rolagem-fina">
        <ul>
          {itens.map((item) => (
            <li key={item.id}>
              <Link
                href={url({ conversa: item.id })}
                scroll={false}
                onClick={() => definirConversaAbrindo(item.id)}
                className="item-conversa"
                aria-current={conversaAberta === item.id ? 'true' : undefined}
                data-abrindo={abrindo === item.id && conversaAberta !== item.id ? 'true' : undefined}
              >
                <span className="avatar">{iniciais(item.contato_nome)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <span className={'truncate text-[12px] ' + (item.nao_lidas > 0 ? 'font-bold' : 'font-semibold')}>
                      {item.contato_nome}
                    </span>
                    <Situacao item={item} />
                  </span>
                  <span className="my-1 block truncate text-[12px] text-tinta-700">
                    {item.ultimo_texto || 'Nenhuma mensagem pública'}
                  </span>
                  <span className="flex items-center justify-between text-[10px] text-bruma-600">
                    <span>
                      {item.ultimo_autor === 'CONTATO' ? 'Cliente' : item.ultimo_autor === 'IA' ? 'IA' : item.responsavel_nome || 'Equipe'}
                      {' · '}
                      {tempoRelativo(item.ultimo_publico_em)}
                    </span>
                    {item.nao_lidas > 0 && (
                      <span className="rounded-full bg-produto-700 px-1.5 py-0.5 text-white">{item.nao_lidas}</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {!itens.length && (
          <div className="space-y-3 p-6 text-center text-sm text-bruma-600">
            <p>{mensagemVazia(escopo, caixa, filtroAntigo !== null)}</p>
            {escopo === 'meu' && caixa === 'todos' && abas.length > 1 && (
              <p className="flex flex-wrap justify-center gap-2 text-xs">
                {abas
                  .filter((aba) => aba.id !== 'meu')
                  .map((aba) => (
                    <Link key={aba.id} href={url({ escopo: aba.id, caixa: '', pagina: '' })} scroll={false} className="botao-link">
                      Ver {aba.id === 'ia' ? 'o que a IA atende' : 'a equipe'}
                    </Link>
                  ))}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t p-2 text-[11px] text-bruma-600">
        <span>
          {inicio ? `${inicio}–${fim}` : 0}
          {total !== null ? ` de ${total}` : ''}
        </span>
        <div className="flex gap-1">
          {pagina > 1 && (
            <Link aria-label="Página anterior" href={url({ pagina: String(pagina - 1) })} className="rounded border p-1">
              <ChevronLeft size={16} />
            </Link>
          )}
          {temProxima && (
            <Link aria-label="Próxima página" href={url({ pagina: String(pagina + 1) })} className="rounded border p-1">
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

/** Texto do estado vazio: diz o que significa estar vazio, não só que está. */
function mensagemVazia(escopo: EscopoAtendimento, caixa: CaixaAtendimento, filtroAntigo: boolean): string {
  if (filtroAntigo) return 'Nenhuma conversa neste filtro.';
  if (escopo === 'ia') {
    return caixa === 'falhas-ia' ? 'A IA não teve falhas nas conversas que atende.' : 'A IA não está atendendo nenhuma conversa agora.';
  }
  if (caixa === 'novos') return 'Nenhuma conversa nova: tudo o que chegou já foi aberto.';
  if (caixa === 'nao-respondidos') return 'Nenhuma conversa aguardando resposta.';
  return escopo === 'meu'
    ? 'Você não tem conversas atribuídas no momento.'
    : 'Nenhuma conversa em atendimento humano no momento.';
}
