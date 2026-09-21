'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import type { Mensagem } from '@/lib/tipos-banco';

/**
 * Atualização em tempo real da central.
 *
 * Duas assinaturas com propósitos diferentes:
 *
 * - `conversas` da organização: qualquer mudança de estado ou de
 *   responsável recarrega os dados do servidor. É o que faz a conversa
 *   sumir da caixa "Não atribuídos" no instante em que outro atendente a
 *   assume, sem ninguém apertar F5.
 * - `mensagens` da conversa aberta: a linha nova é inserida na tela na
 *   hora, sem esperar o servidor responder — é a diferença entre parecer
 *   um chat e parecer um relatório.
 *
 * O recarregamento é adiado em 400 ms de propósito: uma rajada de
 * mensagens dispararia dezenas de recarregamentos seguidos, e o efeito
 * na tela seria pisca-pisca.
 */
export function useTempoReal({
  organizacaoId,
  conversaId,
  aoChegarMensagem,
}: {
  organizacaoId: string;
  conversaId: string | null;
  aoChegarMensagem?: (mensagem: Mensagem) => void;
}) {
  const roteador = useRouter();
  const [conectado, definirConectado] = React.useState(false);
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregarComAtraso = React.useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => roteador.refresh(), 400);
  }, [roteador]);

  React.useEffect(() => {
    const supabase = clienteNavegador();

    const canal = supabase
      .channel(`central:${organizacaoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversas',
          filter: `organizacao_id=eq.${organizacaoId}`,
        },
        () => recarregarComAtraso(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `organizacao_id=eq.${organizacaoId}`,
        },
        (evento) => {
          const mensagem = evento.new as Mensagem;
          if (conversaId && mensagem.conversa_id === conversaId) {
            aoChegarMensagem?.(mensagem);
          } else {
            // Mensagem de outra conversa: só a lista precisa mudar.
            recarregarComAtraso();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensagens',
          filter: `organizacao_id=eq.${organizacaoId}`,
        },
        (evento) => {
          const mensagem = evento.new as Mensagem;
          // Confirmação de entrega/leitura da mensagem aberta.
          if (conversaId && mensagem.conversa_id === conversaId) {
            aoChegarMensagem?.(mensagem);
          }
        },
      )
      .on('postgres_changes',{event:'*',schema:'public',table:'retornos',filter:`organizacao_id=eq.${organizacaoId}`},()=>recarregarComAtraso())
      .subscribe((situacao) => {
        definirConectado(situacao === 'SUBSCRIBED');
        if (situacao === 'SUBSCRIBED') recarregarComAtraso();
      });

    const relogio=setInterval(()=>{if(document.visibilityState==='visible')recarregarComAtraso();},30000);
    return () => {
      clearInterval(relogio);
      if (temporizador.current) clearTimeout(temporizador.current);
      void supabase.removeChannel(canal);
    };
  }, [organizacaoId, conversaId, aoChegarMensagem, recarregarComAtraso]);

  return { conectado };
}
