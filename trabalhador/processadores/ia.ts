/**
 * Turno da IA na fila.
 *
 * A lógica está em `lib/ia/conversar.ts` — este arquivo é só a casca que
 * a fila chama, para o mesmo código poder rodar tanto no worker quanto
 * nos testes sem carregar BullMQ junto.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { executarTurnoIa } from '@/lib/ia/conversar';
import type { TrabalhoIa } from '@/lib/filas/nomes';
import { log } from '@/lib/log';

export async function processarTurnoIa(trabalho: TrabalhoIa): Promise<void> {
  const resultado = await executarTurnoIa(
    clienteAdministrador(),
    trabalho.conversaId,
    trabalho.organizacaoId,
    trabalho.mensagemGatilhoId,
  );

  log.info('Turno da IA concluído', {
    organizacao_id: trabalho.organizacaoId,
    conversa_id: trabalho.conversaId,
    situacao: resultado.situacao,
  });
}
