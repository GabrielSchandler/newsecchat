import * as React from 'react';
import { cn } from '@/lib/utilitarios';

/** Cartão — a superfície branca sobre o fundo cinza da aplicação. */
export function Cartao({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-bruma-200 bg-white shadow-[0_1px_2px_rgba(11,11,13,0.04)]', className)}
      {...resto}
    />
  );
}

export function CabecalhoCartao({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-bruma-200 px-5 py-4', className)} {...resto} />;
}

export function TituloCartao({ className, ...resto }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[15px] font-semibold text-tinta-900', className)} {...resto} />;
}

export function DescricaoCartao({ className, ...resto }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[13px] leading-relaxed text-bruma-600', className)} {...resto} />;
}

export function CorpoCartao({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...resto} />;
}

export function RodapeCartao({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-bruma-200 bg-bruma-50 px-5 py-3', className)}
      {...resto}
    />
  );
}

/** Cabeçalho de página, com título, descrição e ações à direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-tinta-950">{titulo}</h1>
        {descricao ? (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-bruma-600">{descricao}</p>
        ) : null}
      </div>
      {acoes ? <div className="flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

type Tom = 'neutro' | 'produto' | 'sucesso' | 'alerta' | 'erro' | 'ia' | 'escuro';

const TONS: Record<Tom, string> = {
  neutro: 'bg-bruma-100 text-tinta-700 border-bruma-200',
  produto: 'bg-produto-50 text-produto-800 border-produto-100',
  sucesso: 'bg-sucesso-100 text-sucesso-700 border-sucesso-100',
  alerta: 'bg-alerta-100 text-alerta-700 border-alerta-100',
  erro: 'bg-marca-50 text-marca-600 border-marca-50',
  ia: 'bg-ia-50 text-ia-700 border-ia-50',
  escuro: 'bg-tinta-900 text-white border-tinta-900',
};

export function Selo({
  tom = 'neutro',
  className,
  ...resto
}: React.HTMLAttributes<HTMLSpanElement> & { tom?: Tom }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium leading-5',
        TONS[tom],
        className,
      )}
      {...resto}
    />
  );
}

/**
 * Estado vazio.
 *
 * Toda listagem tem um. Uma tabela vazia sem explicação faz o operador
 * achar que o sistema quebrou — aqui ele lê o que falta fazer.
 */
export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icone ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-bruma-100 text-bruma-500">
          {icone}
        </div>
      ) : null}
      <p className="text-sm font-medium text-tinta-800">{titulo}</p>
      {descricao ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-bruma-600">{descricao}</p>
      ) : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

/**
 * Aviso de que uma integração externa não está configurada.
 *
 * Aparece no lugar da funcionalidade, dizendo exatamente o que preencher.
 * É o oposto de esconder o botão: o dono precisa saber que a peça existe
 * e o que falta para ela funcionar.
 */
export function AvisoConfiguracao({
  titulo,
  orientacao,
  className,
}: {
  titulo: string;
  orientacao: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-alerta-100 bg-alerta-100/40 px-4 py-3', className)}>
      <p className="text-[13px] font-semibold text-alerta-700">{titulo}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta-700">{orientacao}</p>
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-bruma-200', className)} />;
}

export function Separador({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-bruma-200', className)} />;
}

/** Um número grande com rótulo. Usado no painel. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  tom?: Tom;
}) {
  return (
    <Cartao className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium leading-tight text-bruma-600">{rotulo}</p>
        {tom !== 'neutro' ? <span className={cn('h-2 w-2 shrink-0 rounded-full', TONS[tom])} /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-tinta-950">{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[12px] text-bruma-500">{detalhe}</p> : null}
    </Cartao>
  );
}
