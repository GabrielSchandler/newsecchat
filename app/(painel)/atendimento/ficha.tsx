'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Brain, ExternalLink, Sparkles, Tag } from 'lucide-react';
import { Selo } from '@/componentes/ui/estrutura';
import { cn, formatarDataHora, tempoRelativo } from '@/lib/utilitarios';
import { formatarTelefone } from '@/lib/nucleo/telefone';
import { rotuloEstado } from '@/lib/nucleo/estados';
import type { ApoioAtendimento, DetalheConversa } from './tipos';
import { alternarEtiqueta } from './acoes';

export function FichaContato({
  detalhe,
  apoio,
}: {
  detalhe: DetalheConversa;
  apoio: ApoioAtendimento;
}) {
  const roteador = useRouter();
  const { contato, conversa } = detalhe;
  const [salvandoEtiqueta, definirSalvando] = React.useState<string | null>(null);

  const preenchidos = detalhe.campos.filter((campo) => campo.valor);
  const faltando = detalhe.campos.filter((campo) => !campo.valor);

  async function trocarEtiqueta(etiquetaId: string, ativa: boolean) {
    definirSalvando(etiquetaId);
    try {
      const resultado = await alternarEtiqueta(conversa.id, etiquetaId, !ativa);
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível alterar a etiqueta.');
        return;
      }
      roteador.refresh();
    } finally {
      definirSalvando(null);
    }
  }

  return (
    <aside className="hidden h-full w-[300px] shrink-0 overflow-y-auto rolagem-fina border-l border-bruma-200 bg-white xl:block">
      <div className="border-b border-bruma-200 px-4 py-4">
        <p className="text-[15px] font-semibold text-tinta-900">
          {contato.nome || contato.nome_perfil_whatsapp || 'Sem nome'}
        </p>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-bruma-600">
          {formatarTelefone(contato.telefone)}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Selo tom={contato.eh_cliente ? 'produto' : 'neutro'}>
            {contato.eh_cliente ? 'Cliente' : 'Lead'}
          </Selo>
          <Selo tom="neutro">{rotuloEstado[conversa.estado]}</Selo>
          {!contato.aceita_campanha ? <Selo tom="alerta">Fora de campanhas</Selo> : null}
          {contato.bloqueado ? <Selo tom="erro">Bloqueado</Selo> : null}
        </div>

        <Link
          href={`/contatos/${contato.id}`}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-produto-700 underline-offset-4 hover:underline"
        >
          Ficha completa
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <Bloco titulo="Atendimento">
        <Linha rotulo="Responsável" valor={detalhe.responsavelNome ?? 'Ninguém'} />
        <Linha rotulo="Departamento" valor={detalhe.departamento?.nome ?? 'Sem departamento'} />
        <Linha rotulo="Canal" valor={detalhe.canal?.nome ?? '—'} />
        <Linha rotulo="Origem" valor={contato.origem ?? '—'} />
        {detalhe.campanhaNome ? <Linha rotulo="Campanha" valor={detalhe.campanhaNome} /> : null}
        <Linha rotulo="Iniciada" valor={formatarDataHora(conversa.iniciada_em)} />
        {conversa.encerrada_em ? (
          <Linha rotulo="Encerrada" valor={formatarDataHora(conversa.encerrada_em)} />
        ) : null}
        {conversa.motivo_encerramento ? (
          <Linha rotulo="Motivo" valor={conversa.motivo_encerramento} />
        ) : null}
      </Bloco>

      {apoio.etiquetas.length ? (
        <Bloco titulo="Etiquetas" icone={<Tag className="h-3 w-3" aria-hidden />}>
          <div className="flex flex-wrap gap-1.5">
            {apoio.etiquetas.map((etiqueta) => {
              const ativa = detalhe.etiquetasDaConversa.includes(etiqueta.id);
              return (
                <button
                  key={etiqueta.id}
                  type="button"
                  disabled={salvandoEtiqueta === etiqueta.id}
                  onClick={() => void trocarEtiqueta(etiqueta.id, ativa)}
                  aria-pressed={ativa}
                  className={cn(
                    'rounded-lg border px-2 py-0.5 text-[11.5px] font-medium transition-colors disabled:opacity-50',
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
        </Bloco>
      ) : null}

      <Bloco titulo="Dados coletados">
        {preenchidos.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-bruma-600">
            Nada coletado ainda. A IA preenche conforme a conversa avança.
          </p>
        ) : (
          <dl className="space-y-1.5">
            {preenchidos.map((campo) => (
              <div key={campo.chave} className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-[12px] text-bruma-600">{campo.rotulo}</dt>
                <dd className="min-w-0 truncate text-right text-[12.5px] font-medium text-tinta-900">
                  {campo.valor}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {faltando.length ? (
          <p className="mt-2.5 border-t border-bruma-100 pt-2 text-[11.5px] leading-relaxed text-bruma-500">
            Ainda falta: {faltando.map((campo) => campo.rotulo).join(', ')}.
          </p>
        ) : null}
      </Bloco>

      {contato.resumo ? (
        <Bloco titulo="Resumo da IA" icone={<Sparkles className="h-3 w-3" aria-hidden />}>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-tinta-800">
            {contato.resumo}
          </p>
          {contato.resumo_atualizado_em ? (
            <p className="mt-1.5 text-[11px] text-bruma-500">
              atualizado {tempoRelativo(contato.resumo_atualizado_em)}
            </p>
          ) : null}
        </Bloco>
      ) : null}

      {detalhe.memorias.length ? (
        <Bloco titulo="Memória do contato" icone={<Brain className="h-3 w-3" aria-hidden />}>
          <ul className="space-y-1.5">
            {detalhe.memorias.map((memoria) => (
              <li key={memoria.id} className="text-[12.5px] leading-relaxed">
                <span className="font-medium text-tinta-800">{memoria.chave}: </span>
                <span className="text-bruma-600">{memoria.conteudo}</span>
              </li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {contato.observacoes ? (
        <Bloco titulo="Observações">
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-tinta-800">
            {contato.observacoes}
          </p>
        </Bloco>
      ) : null}
    </aside>
  );
}

function Bloco({
  titulo,
  icone,
  children,
}: {
  titulo: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-bruma-200 px-4 py-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bruma-500">
        {icone}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-[12px] text-bruma-600">{rotulo}</span>
      <span className="min-w-0 truncate text-right text-[12.5px] text-tinta-900">{valor}</span>
    </div>
  );
}
