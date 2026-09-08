'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bot, CircleUser, Inbox, Search, UserCheck } from 'lucide-react';
import { cn, iniciais, tempoRelativo } from '@/lib/utilitarios';
import { formatarTelefone } from '@/lib/nucleo/telefone';
import { rotuloEstado } from '@/lib/nucleo/estados';
import type { Departamento } from '@/lib/tipos-banco';
import { CAIXAS, rotuloCaixa, type Caixa, type ConversaDaLista, type ContagensCaixas } from './tipos';

const ICONE_CAIXA: Partial<Record<Caixa, React.ComponentType<{ className?: string }>>> = {
  minhas: UserCheck,
  'nao-atribuidas': Inbox,
  ia: Bot,
  humano: CircleUser,
};

const CHAVE_CONTAGEM: Record<Caixa, keyof ContagensCaixas> = {
  minhas: 'minhas',
  'nao-atribuidas': 'nao_atribuidas',
  ia: 'ia',
  'aguardando-humano': 'aguardando_humano',
  'aguardando-cliente': 'aguardando_cliente',
  humano: 'humano',
  encerradas: 'encerradas',
  todas: 'todas',
};

export function ListaConversas({
  lista,
  contagens,
  departamentos,
  caixaAtual,
  departamentoAtual,
  buscaAtual,
  conversaSelecionada,
}: {
  lista: ConversaDaLista[];
  contagens: ContagensCaixas;
  departamentos: Departamento[];
  caixaAtual: Caixa;
  departamentoAtual: string | null;
  buscaAtual: string;
  conversaSelecionada: string | null;
}) {
  const roteador = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [busca, definirBusca] = React.useState(buscaAtual);

  const montarUrl = React.useCallback(
    (mudancas: Record<string, string | null>) => {
      const novos = new URLSearchParams(parametros.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === '') novos.delete(chave);
        else novos.set(chave, valor);
      }
      const consulta = novos.toString();
      return consulta ? `${caminho}?${consulta}` : caminho;
    },
    [caminho, parametros],
  );

  // A busca só vai ao servidor depois que o usuário para de digitar.
  React.useEffect(() => {
    if (busca === buscaAtual) return;
    const relogio = setTimeout(() => {
      roteador.replace(montarUrl({ busca: busca.trim() || null }), { scroll: false });
    }, 350);
    return () => clearTimeout(relogio);
  }, [busca, buscaAtual, montarUrl, roteador]);

  return (
    <div className="flex h-full w-full flex-col border-r border-bruma-200 bg-white">
      <div className="border-b border-bruma-200 px-3 py-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bruma-500"
            aria-hidden
          />
          <input
            type="search"
            value={busca}
            onChange={(evento) => definirBusca(evento.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar conversas"
            className="h-8 w-full rounded-lg border border-bruma-300 bg-bruma-50 pl-8 pr-2 text-[13px] text-tinta-900 placeholder:text-bruma-500 focus:border-produto-700 focus:bg-white"
          />
        </div>
      </div>

      <nav className="border-b border-bruma-200 px-2 py-2" aria-label="Caixas">
        <ul className="space-y-0.5">
          {CAIXAS.map((caixa) => {
            const Icone = ICONE_CAIXA[caixa];
            const total = contagens[CHAVE_CONTAGEM[caixa]];
            const ativa = caixaAtual === caixa;

            return (
              <li key={caixa}>
                <Link
                  href={montarUrl({ caixa, conversa: null })}
                  aria-current={ativa ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                    ativa
                      ? 'bg-produto-50 font-medium text-produto-800'
                      : 'text-tinta-700 hover:bg-bruma-100',
                  )}
                >
                  {Icone ? <Icone className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <span className="w-3.5" />}
                  <span className="flex-1 truncate">{rotuloCaixa[caixa]}</span>
                  {total > 0 ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-lg px-1.5 text-[11px] font-medium tabular-nums',
                        ativa ? 'bg-produto-100 text-produto-800' : 'bg-bruma-100 text-bruma-600',
                      )}
                    >
                      {total}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {departamentos.length ? (
          <div className="mt-2 border-t border-bruma-200 pt-2">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-bruma-500">
              Departamento
            </p>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href={montarUrl({ departamento: null, conversa: null })}
                  className={cn(
                    'flex rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                    !departamentoAtual
                      ? 'bg-bruma-100 font-medium text-tinta-900'
                      : 'text-tinta-700 hover:bg-bruma-100',
                  )}
                >
                  Todos
                </Link>
              </li>
              {departamentos.map((departamento) => (
                <li key={departamento.id}>
                  <Link
                    href={montarUrl({ departamento: departamento.id, conversa: null })}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                      departamentoAtual === departamento.id
                        ? 'bg-bruma-100 font-medium text-tinta-900'
                        : 'text-tinta-700 hover:bg-bruma-100',
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: departamento.cor }}
                      aria-hidden
                    />
                    <span className="truncate">{departamento.nome}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto rolagem-fina">
        {lista.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-bruma-600">
            {buscaAtual
              ? 'Nenhuma conversa encontrada para esta busca.'
              : 'Nenhuma conversa nesta caixa.'}
          </p>
        ) : (
          <ul>
            {lista.map((item) => {
              const nome =
                item.contato?.nome ||
                item.contato?.nome_perfil_whatsapp ||
                formatarTelefone(item.contato?.telefone ?? '');
              const selecionada = conversaSelecionada === item.conversa.id;

              return (
                <li key={item.conversa.id}>
                  <Link
                    href={montarUrl({ conversa: item.conversa.id })}
                    scroll={false}
                    className={cn(
                      'flex gap-2.5 border-b border-bruma-100 px-3 py-2.5 transition-colors',
                      selecionada ? 'bg-produto-50' : 'hover:bg-bruma-50',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold',
                        selecionada ? 'bg-produto-100 text-produto-800' : 'bg-bruma-100 text-tinta-700',
                      )}
                      aria-hidden
                    >
                      {iniciais(nome)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13.5px] font-medium text-tinta-900">{nome}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-bruma-500">
                          {tempoRelativo(item.conversa.ultima_mensagem_em ?? item.conversa.iniciada_em)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="line-clamp-1 flex-1 text-[12.5px] leading-snug text-bruma-600">
                          {item.conversa.ultima_mensagem_previa ?? 'Sem mensagens'}
                        </span>
                        {item.conversa.nao_lidas > 0 ? (
                          <span className="shrink-0 rounded-full bg-produto-700 px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">
                            {item.conversa.nao_lidas}
                          </span>
                        ) : null}
                      </span>

                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        <EstadoMini estado={item.conversa.estado} />
                        {item.departamento ? (
                          <span
                            className="rounded border px-1 py-px text-[10px] font-medium leading-4"
                            style={{
                              borderColor: `${item.departamento.cor}33`,
                              color: item.departamento.cor,
                              backgroundColor: `${item.departamento.cor}0f`,
                            }}
                          >
                            {item.departamento.nome}
                          </span>
                        ) : null}
                        {item.responsavelNome ? (
                          <span className="truncate text-[10px] text-bruma-500">
                            {item.responsavelNome}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EstadoMini({ estado }: { estado: ConversaDaLista['conversa']['estado'] }) {
  const cores: Record<string, string> = {
    IA: 'bg-tinta-800 text-bruma-100',
    AGUARDANDO_HUMANO: 'bg-alerta-100 text-alerta-700',
    HUMANO: 'bg-produto-100 text-produto-800',
    AGUARDANDO_CLIENTE: 'bg-bruma-100 text-bruma-600',
    ENCERRADA: 'bg-bruma-100 text-bruma-500',
  };

  return (
    <span
      className={cn(
        'rounded px-1 py-px text-[10px] font-medium leading-4',
        cores[estado] ?? 'bg-bruma-100 text-bruma-600',
      )}
    >
      {rotuloEstado[estado]}
    </span>
  );
}
