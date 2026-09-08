import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { CabecalhoPagina, Cartao, EstadoVazio, Selo } from '@/componentes/ui/estrutura';
import { formatarTelefone, normalizarTelefone } from '@/lib/nucleo/telefone';
import { iniciais, tempoRelativo } from '@/lib/utilitarios';
import { BuscaContatos } from './busca';

export const metadata: Metadata = { title: 'Contatos' };
export const dynamic = 'force-dynamic';

const POR_PAGINA = 40;

export default async function PaginaContatos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirSessao();
  const parametros = await searchParams;

  const ler = (chave: string) => {
    const valor = parametros[chave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const busca = (ler('busca') ?? '').trim();
  const etiquetaId = ler('etiqueta') ?? '';
  const pagina = Math.max(1, Number(ler('pagina') ?? 1) || 1);

  const supabase = await clienteServidor();

  const [etiquetasResposta] = await Promise.all([
    supabase.from('etiquetas').select('*').eq('organizacao_id', sessao.organizacao.id).order('nome'),
  ]);

  // O filtro por etiqueta vira uma lista de ids antes da consulta
  // principal — mais simples e mais previsível que um join aninhado.
  let idsPorEtiqueta: string[] | null = null;
  if (etiquetaId) {
    const { data } = await supabase
      .from('etiquetas_contato')
      .select('contato_id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('etiqueta_id', etiquetaId)
      .limit(1000);

    idsPorEtiqueta = (data ?? []).map((linha) => linha.contato_id);
    if (idsPorEtiqueta.length === 0) idsPorEtiqueta = ['00000000-0000-0000-0000-000000000000'];
  }

  let consulta = supabase
    .from('contatos')
    .select('*', { count: 'exact' })
    .eq('organizacao_id', sessao.organizacao.id)
    .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (idsPorEtiqueta) consulta = consulta.in('id', idsPorEtiqueta);

  if (busca) {
    const digitos = normalizarTelefone(busca) ?? busca.replace(/\D/g, '');
    consulta =
      digitos.length >= 3
        ? consulta.or(`nome.ilike.%${busca}%,telefone.ilike.%${digitos}%`)
        : consulta.ilike('nome', `%${busca}%`);
  }

  const { data: contatos, count } = await consulta;
  const total = count ?? 0;
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <CabecalhoPagina
        titulo="Contatos"
        descricao={`${total} contato(s) na base de ${sessao.organizacao.nome}.`}
      />

      <BuscaContatos
        buscaAtual={busca}
        etiquetaAtual={etiquetaId}
        etiquetas={etiquetasResposta.data ?? []}
      />

      {!contatos?.length ? (
        <Cartao className="mt-4">
          <EstadoVazio
            icone={<Users className="h-5 w-5" />}
            titulo={busca || etiquetaId ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
            descricao={
              busca || etiquetaId
                ? 'Tente outro termo, ou limpe os filtros.'
                : 'Os contatos aparecem sozinhos quando alguém envia mensagem para um número conectado, ou quando você importa uma planilha.'
            }
          />
        </Cartao>
      ) : (
        <>
          <Cartao className="mt-4 overflow-hidden">
            <ul className="divide-y divide-bruma-100">
              {contatos.map((contato) => (
                <li key={contato.id}>
                  <Link
                    href={`/contatos/${contato.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bruma-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bruma-100 text-[12px] font-semibold text-tinta-700">
                      {iniciais(contato.nome ?? contato.nome_perfil_whatsapp ?? '?')}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-tinta-900">
                          {contato.nome || contato.nome_perfil_whatsapp || 'Sem nome'}
                        </span>
                        {contato.eh_cliente ? <Selo tom="produto">cliente</Selo> : null}
                        {!contato.aceita_campanha ? <Selo tom="alerta">sem campanha</Selo> : null}
                        {contato.bloqueado ? <Selo tom="erro">bloqueado</Selo> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-bruma-600">
                        {formatarTelefone(contato.telefone)}
                        {contato.origem ? ` · ${contato.origem}` : ''}
                      </span>
                    </span>

                    <span className="shrink-0 text-[12px] text-bruma-500">
                      {contato.ultima_interacao_em
                        ? tempoRelativo(contato.ultima_interacao_em)
                        : 'sem interação'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Cartao>

          <div className="mt-3 flex items-center justify-between text-[13px] text-bruma-600">
            <span>
              Página {pagina} de {ultimaPagina}
            </span>
            <div className="flex gap-2">
              {pagina > 1 ? (
                <Link
                  href={`/contatos?pagina=${pagina - 1}${busca ? `&busca=${encodeURIComponent(busca)}` : ''}${etiquetaId ? `&etiqueta=${etiquetaId}` : ''}`}
                  className="rounded-lg border border-bruma-300 bg-white px-3 py-1.5 font-medium text-tinta-800 hover:bg-bruma-50"
                >
                  Anterior
                </Link>
              ) : null}
              {pagina < ultimaPagina ? (
                <Link
                  href={`/contatos?pagina=${pagina + 1}${busca ? `&busca=${encodeURIComponent(busca)}` : ''}${etiquetaId ? `&etiqueta=${etiquetaId}` : ''}`}
                  className="rounded-lg border border-bruma-300 bg-white px-3 py-1.5 font-medium text-tinta-800 hover:bg-bruma-50"
                >
                  Próxima
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
