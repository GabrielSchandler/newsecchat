import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Integrações' };

/**
 * Só existe uma integração hoje. Em vez de uma tela de índice com um item
 * só, a rota leva direto para ela.
 */
export default function PaginaIntegracoes() {
  redirect('/integracoes/google-sheets');
}
