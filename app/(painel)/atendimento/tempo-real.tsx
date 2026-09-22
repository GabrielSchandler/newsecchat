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
 * Recarregar é caro: `router.refresh()` refaz a página inteira no servidor
 * (sessão, fila, contagens, conversa aberta) e o servidor fica longe do
 * banco. Por isso a recarga é RARA e AGRUPADA, nunca uma por evento:
 *
 * - no máximo uma a cada INTERVALO_MINIMO_MS, seja qual for o volume de
 *   eventos. Uma rajada de mensagens vira uma recarga só, que já enxerga
 *   tudo o que chegou;
 * - a primeira conexão NÃO recarrega — a tela acabou de vir do servidor.
 *   Antes, cada conversa aberta refazia a assinatura e provocava uma
 *   recarga extra logo depois do clique, na hora em que o usuário mais
 *   espera a tela responder;
 * - com o tempo real conectado, o relógio de segurança é lento; só acelera
 *   se a conexão cair.
 */
const ATRASO_MS = 600;
const INTERVALO_MINIMO_MS = 3_000;
const RELOGIO_CONECTADO_MS = 90_000;
const RELOGIO_DESCONECTADO_MS = 15_000;
/** Ao voltar para a aba, só recarrega se ela ficou parada por mais que isto. */
const PARADA_AO_VOLTAR_MS = 20_000;

// Valor de módulo: vale para todas as assinaturas da aba (a da lista e a da
// conversa), então uma não recarrega logo depois da outra.
let ultimaRecarga = Date.now();

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
  const conectadoRef = React.useRef(false);
  const jaConectou = React.useRef(false);
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregarComAtraso = React.useCallback(() => {
    // Já existe uma recarga agendada: ela vai buscar tudo, esta seria repetida.
    if (temporizador.current) return;

    const espera = Math.max(ATRASO_MS, ultimaRecarga + INTERVALO_MINIMO_MS - Date.now());

    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      ultimaRecarga = Date.now();
      roteador.refresh();
    }, espera);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'retornos', filter: `organizacao_id=eq.${organizacaoId}` },
        () => recarregarComAtraso(),
      )
      .subscribe((situacao) => {
        const conectou = situacao === 'SUBSCRIBED';
        conectadoRef.current = conectou;
        definirConectado(conectou);

        // Só a RECONEXÃO recarrega: durante a queda podem ter passado
        // eventos. A primeira conexão não perdeu nada.
        if (conectou && jaConectou.current) recarregarComAtraso();
        if (conectou) jaConectou.current = true;
      });

    // Rede de segurança: o tempo real não garante entrega. Lenta enquanto
    // conectado, mais rápida se a conexão cair.
    const relogio = setInterval(() => {
      if (document.visibilityState !== 'visible') return;

      const limite = conectadoRef.current ? RELOGIO_CONECTADO_MS : RELOGIO_DESCONECTADO_MS;
      if (Date.now() - ultimaRecarga >= limite) recarregarComAtraso();
    }, RELOGIO_DESCONECTADO_MS);

    // Voltou para a aba depois de um tempo: mostra o que aconteceu enquanto esteve fora.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaRecarga >= PARADA_AO_VOLTAR_MS) {
        recarregarComAtraso();
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = null;
      void supabase.removeChannel(canal);
    };
  }, [organizacaoId, conversaId, aoChegarMensagem, recarregarComAtraso]);

  return { conectado };
}
