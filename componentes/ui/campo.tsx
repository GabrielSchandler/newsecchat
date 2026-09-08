'use client';

import * as React from 'react';
import { cn } from '@/lib/utilitarios';

const BASE =
  'w-full rounded-lg border border-bruma-300 bg-white px-3 text-sm text-tinta-900 placeholder:text-bruma-500 transition-colors focus:border-produto-700 disabled:cursor-not-allowed disabled:bg-bruma-100 disabled:text-bruma-500';

export const Entrada = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...resto }, ref) => (
    <input ref={ref} className={cn(BASE, 'h-9', className)} {...resto} />
  ),
);
Entrada.displayName = 'Entrada';

export const AreaTexto = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...resto }, ref) => (
  <textarea ref={ref} className={cn(BASE, 'min-h-[80px] py-2 leading-relaxed', className)} {...resto} />
));
AreaTexto.displayName = 'AreaTexto';

export const Selecao = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...resto }, ref) => (
  <select ref={ref} className={cn(BASE, 'h-9 pr-8', className)} {...resto} />
));
Selecao.displayName = 'Selecao';

export function Rotulo({
  className,
  obrigatorio,
  children,
  ...resto
}: React.LabelHTMLAttributes<HTMLLabelElement> & { obrigatorio?: boolean }) {
  return (
    <label className={cn('mb-1.5 block text-[13px] font-medium text-tinta-800', className)} {...resto}>
      {children}
      {obrigatorio ? <span className="ml-0.5 text-marca-500">*</span> : null}
    </label>
  );
}

/**
 * Um campo completo: rótulo, controle, ajuda e erro.
 *
 * A mensagem de ajuda fica ACIMA do controle quando explica o que
 * preencher — quem lê depois de digitar já errou.
 */
export function Campo({
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  htmlFor,
  className,
  children,
}: {
  rotulo?: string;
  ajuda?: React.ReactNode;
  erro?: string | null;
  obrigatorio?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('w-full', className)}>
      {rotulo ? (
        <Rotulo htmlFor={htmlFor} obrigatorio={obrigatorio}>
          {rotulo}
        </Rotulo>
      ) : null}
      {ajuda ? <p className="mb-1.5 text-xs leading-relaxed text-bruma-600">{ajuda}</p> : null}
      {children}
      {erro ? <p className="mt-1.5 text-xs font-medium text-marca-600">{erro}</p> : null}
    </div>
  );
}
