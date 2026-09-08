'use client';

import * as React from 'react';
import * as DialogoRadix from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utilitarios';

export const Dialogo = DialogoRadix.Root;
export const GatilhoDialogo = DialogoRadix.Trigger;
export const FecharDialogo = DialogoRadix.Close;

export function ConteudoDialogo({
  className,
  children,
  titulo,
  descricao,
  ...resto
}: React.ComponentPropsWithoutRef<typeof DialogoRadix.Content> & {
  titulo: string;
  descricao?: string;
}) {
  return (
    <DialogoRadix.Portal>
      <DialogoRadix.Overlay className="fixed inset-0 z-50 bg-tinta-950/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogoRadix.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-bruma-200 bg-white shadow-xl',
          'max-h-[calc(100vh-4rem)] overflow-y-auto rolagem-fina',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...resto}
      >
        <div className="flex items-start justify-between gap-4 border-b border-bruma-200 px-5 py-4">
          <div className="min-w-0">
            <DialogoRadix.Title className="text-[15px] font-semibold text-tinta-900">
              {titulo}
            </DialogoRadix.Title>
            {descricao ? (
              <DialogoRadix.Description className="mt-1 text-[13px] leading-relaxed text-bruma-600">
                {descricao}
              </DialogoRadix.Description>
            ) : null}
          </div>
          <DialogoRadix.Close
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-bruma-500 transition-colors hover:bg-bruma-100 hover:text-tinta-800"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </DialogoRadix.Close>
        </div>
        {children}
      </DialogoRadix.Content>
    </DialogoRadix.Portal>
  );
}

export function CorpoDialogo({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-4 px-5 py-4', className)} {...resto} />;
}

export function RodapeDialogo({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-bruma-200 bg-bruma-50 px-5 py-3', className)}
      {...resto}
    />
  );
}
