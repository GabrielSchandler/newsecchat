'use client';

import * as React from 'react';

/**
 * Feedback imediato ao abrir uma conversa.
 *
 * Abrir uma conversa é uma navegação que o servidor precisa atender
 * (carrega a conversa, o contato, as mensagens). Até a resposta chegar, o
 * Next.js mantém a tela antiga como está, e o clique parece não ter
 * acontecido — o usuário clica de novo, ou acha que travou. A lista avisa
 * aqui, no mesmo instante do clique, qual conversa está sendo aberta; o
 * item ganha destaque e o painel da conversa mostra a barra de progresso.
 *
 * Fica num módulo próprio, com um valor fora do React, porque quem clica (a
 * lista) e quem mostra o aviso (o painel) são componentes irmãos, sem pai
 * de cliente em comum.
 */
let alvo: string | null = null;
let liberar: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Passa `null` quando a conversa terminou de abrir. */
export function definirConversaAbrindo(id: string | null) {
  if (liberar) clearTimeout(liberar);
  liberar = null;
  if (alvo === id) return;

  alvo = id;
  avisar();

  // Rede de segurança: se a navegação falhar ou for cancelada, o destaque
  // não pode ficar preso para sempre.
  if (id) liberar = setTimeout(() => definirConversaAbrindo(null), 15_000);
}

export function useConversaAbrindo(): string | null {
  return React.useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => void ouvintes.delete(ouvinte);
    },
    () => alvo,
    () => null,
  );
}

/** Barra fina no topo do painel da conversa enquanto a próxima abre. */
export function IndicadorAbrindo({ conversaAtual }: { conversaAtual: string | null }) {
  const abrindo = useConversaAbrindo();

  if (!abrindo || abrindo === conversaAtual) return null;

  return (
    <div role="status" aria-live="polite" className="absolute inset-x-0 top-0 z-20">
      <div className="h-0.5 w-full overflow-hidden bg-produto-100">
        <div className="barra-abrindo h-full w-1/3 bg-produto-700" />
      </div>
      <span className="sr-only">Abrindo conversa…</span>
    </div>
  );
}
