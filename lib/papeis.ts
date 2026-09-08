/**
 * Papéis e hierarquia.
 *
 * Fica separado de `lib/sessao.ts` porque componentes de cliente precisam
 * dos rótulos, e `sessao.ts` é `server-only` — importá-lo do navegador
 * quebraria o build.
 */
import type { PapelMembro } from '@/lib/tipos-banco';

export const HIERARQUIA_PAPEL: Record<PapelMembro, number> = {
  ATENDENTE: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export const rotuloPapel: Record<PapelMembro, string> = {
  SUPER_ADMIN: 'Proprietário',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  ATENDENTE: 'Atendente',
};

export function papelAtende(papel: PapelMembro, minimo: PapelMembro): boolean {
  return HIERARQUIA_PAPEL[papel] >= HIERARQUIA_PAPEL[minimo];
}
