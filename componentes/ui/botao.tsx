'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utilitarios';

/**
 * Botão.
 *
 * `principal` é verde-petróleo, não vermelho: a cor da marca fica
 * reservada para destruir/alertar, senão o vermelho perde o significado
 * numa tela cheia de ações rotineiras.
 */
const variantes = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap',
  {
    variants: {
      variante: {
        principal: 'bg-produto-700 text-white hover:bg-produto-800',
        secundario: 'bg-white text-tinta-900 border border-bruma-300 hover:bg-bruma-50',
        suave: 'bg-bruma-100 text-tinta-800 hover:bg-bruma-200',
        fantasma: 'text-tinta-700 hover:bg-bruma-100',
        destrutivo: 'bg-marca-500 text-white hover:bg-marca-600',
        escuro: 'bg-tinta-900 text-white hover:bg-tinta-800',
        elo: 'text-produto-700 underline-offset-4 hover:underline',
      },
      tamanho: {
        pequeno: 'h-8 px-3 text-[13px]',
        medio: 'h-9 px-4',
        grande: 'h-11 px-6 text-[15px]',
        icone: 'h-9 w-9',
        iconePequeno: 'h-7 w-7',
      },
    },
    defaultVariants: { variante: 'principal', tamanho: 'medio' },
  },
);

export interface PropriedadesBotao
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variantes> {
  comoFilho?: boolean;
  carregando?: boolean;
}

export const Botao = React.forwardRef<HTMLButtonElement, PropriedadesBotao>(
  ({ className, variante, tamanho, comoFilho = false, carregando = false, children, disabled, ...resto }, ref) => {
    const Componente = comoFilho ? Slot : 'button';

    // Com `comoFilho`, o Slot exige um único filho: o indicador de
    // carregamento não pode ser injetado sem quebrar isso.
    if (comoFilho) {
      return (
        <Componente className={cn(variantes({ variante, tamanho }), className)} ref={ref} {...resto}>
          {children}
        </Componente>
      );
    }

    return (
      <button
        className={cn(variantes({ variante, tamanho }), className)}
        ref={ref}
        disabled={disabled || carregando}
        {...resto}
      >
        {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);

Botao.displayName = 'Botao';
