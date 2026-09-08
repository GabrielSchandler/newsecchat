/**
 * Despacho de mensagem para o provedor.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { despacharMensagem } from '@/lib/servicos/envio';
import type { TrabalhoEnvioMensagem } from '@/lib/filas/nomes';
import { log } from '@/lib/log';

export async function processarEnvio(trabalho: TrabalhoEnvioMensagem): Promise<void> {
  const resultado = await despacharMensagem(
    clienteAdministrador(),
    trabalho.mensagemId,
    trabalho.organizacaoId,
  );

  log.info('Despacho concluído', {
    organizacao_id: trabalho.organizacaoId,
    mensagem_id: trabalho.mensagemId,
    situacao: resultado.status,
    motivo: resultado.motivo,
  });
}
