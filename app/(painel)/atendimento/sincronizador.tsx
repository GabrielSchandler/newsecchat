'use client';

import { useTempoReal } from './tempo-real';

/**
 * Mantém o tempo real ligado quando nenhuma conversa está aberta.
 *
 * A assinatura vive no componente da conversa; sem uma conversa
 * selecionada, ele não existe e a lista deixaria de se atualizar — o
 * operador olhando a caixa vazia não veria a primeira mensagem chegar.
 */
export function SincronizadorLista({ organizacaoId }: { organizacaoId: string }) {
  useTempoReal({ organizacaoId, conversaId: null });
  return null;
}
