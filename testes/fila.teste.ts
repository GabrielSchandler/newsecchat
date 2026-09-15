/**
 * Fila sem Redis — o caso da Vercel.
 *
 * O contrato que estes testes protegem: sem fila no processo, o trabalho
 * que deixa rastro no banco é DELEGADO ao worker, sem erro; o webhook NÃO
 * marca o evento como enfileirado (senão a varredura nunca o acharia); e
 * trabalho que só existe dentro do worker nunca é delegado em silêncio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ambienteOriginal = { ...process.env };

async function carregarProdutor() {
  // O ambiente é lido na importação: cada teste recarrega o módulo com as
  // variáveis que ele definiu.
  vi.resetModules();
  return import('@/lib/filas/produtor');
}

describe('fila sem Redis: o trabalho fica para o worker', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.FILA_EM_MEMORIA;
  });

  afterEach(() => {
    process.env = { ...ambienteOriginal };
  });

  it('sem REDIS_URL e sem fila em memória, o modo é BANCO', async () => {
    const { modoFila } = await carregarProdutor();

    expect(modoFila()).toBe('BANCO');
  });

  it('mensagem a enviar é delegada, sem erro para o atendente', async () => {
    const { enfileirar, FILAS } = await carregarProdutor();

    await expect(
      enfileirar(FILAS.mensagensEnviadas, { mensagemId: 'm-1', organizacaoId: 'o-1' }),
    ).resolves.toBe('DELEGADO');
  });

  it('o webhook não marca o evento como enfileirado quando só delegou', async () => {
    const { enfileirarTolerante, FILAS } = await carregarProdutor();

    await expect(enfileirarTolerante(FILAS.eventosWebhook, { eventoId: 'e-1' })).resolves.toBe(false);
  });

  it('campanha, análise e planilha também podem ser delegadas', async () => {
    const { enfileirar, FILAS } = await carregarProdutor();

    await expect(enfileirar(FILAS.campanhas, { campanhaId: 'c', organizacaoId: 'o' })).resolves.toBe('DELEGADO');
    await expect(enfileirar(FILAS.analiseIa, { execucaoId: 'x', organizacaoId: 'o' })).resolves.toBe('DELEGADO');
    await expect(
      enfileirar(FILAS.sincronizacaoPlanilhas, { integracaoSheetsId: 'p', organizacaoId: 'o' }),
    ).resolves.toBe('DELEGADO');
  });

  it('trabalho que só existe no worker não é delegado em silêncio', async () => {
    const { enfileirar, FILAS } = await carregarProdutor();

    await expect(
      enfileirar(FILAS.processamentoIa, { conversaId: 'c', mensagemGatilhoId: 'm', organizacaoId: 'o' }),
    ).rejects.toThrow(/só existe dentro do worker/);
  });

  it('com fila em memória ligada, o modo é MEMORIA', async () => {
    process.env.FILA_EM_MEMORIA = 'true';
    const { modoFila } = await carregarProdutor();

    expect(modoFila()).toBe('MEMORIA');
  });
});
