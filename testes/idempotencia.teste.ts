/**
 * Idempotência: mensagem duplicada, webhook duplicado, linha de planilha
 * reprocessada e envio de campanha repetido.
 *
 * O que se verifica aqui é a propriedade que sustenta tudo: a chave é
 * DETERMINÍSTICA. Chave aleatória por tentativa não protegeria de nada,
 * porque o retry geraria outra e o efeito aconteceria duas vezes.
 */
import { describe, expect, it } from 'vitest';
import {
  chaveEnvioCampanha,
  chaveEnvioManual,
  chaveEventoWebhook,
  chaveLinhaPlanilha,
  chaveRespostaIa,
  hashConteudoLinha,
} from '@/lib/nucleo/idempotencia';

describe('chaves de idempotência', () => {
  it('o mesmo evento de webhook gera sempre a mesma chave', () => {
    const primeira = chaveEventoWebhook('EVOLUTION', 'grs-comercial', 'ABC123');
    const segunda = chaveEventoWebhook('EVOLUTION', 'grs-comercial', 'ABC123');

    expect(primeira).toBe(segunda);
  });

  it('eventos diferentes geram chaves diferentes', () => {
    expect(chaveEventoWebhook('EVOLUTION', 'inst', 'A')).not.toBe(
      chaveEventoWebhook('EVOLUTION', 'inst', 'B'),
    );

    // Mesma mensagem em instâncias diferentes é evento diferente.
    expect(chaveEventoWebhook('EVOLUTION', 'inst-1', 'A')).not.toBe(
      chaveEventoWebhook('EVOLUTION', 'inst-2', 'A'),
    );
  });

  it('a resposta da IA é única por mensagem que a disparou', () => {
    const chave = chaveRespostaIa('conversa-1', 'mensagem-9');

    expect(chave).toBe(chaveRespostaIa('conversa-1', 'mensagem-9'));
    expect(chave).not.toBe(chaveRespostaIa('conversa-1', 'mensagem-10'));

    // Duas conversas diferentes reagindo à mesma mensagem não colidem.
    expect(chave).not.toBe(chaveRespostaIa('conversa-2', 'mensagem-9'));
  });

  it('campanha envia uma vez por destinatário, mesmo com retry', () => {
    const chave = chaveEnvioCampanha('camp-1', 'contato-1');

    expect(chave).toBe(chaveEnvioCampanha('camp-1', 'contato-1'));
    expect(chave).not.toBe(chaveEnvioCampanha('camp-1', 'contato-2'));
    expect(chave).not.toBe(chaveEnvioCampanha('camp-2', 'contato-1'));
  });

  it('clique duplo do atendente não manda a mensagem duas vezes', () => {
    const agora = 1_700_000_000_000;

    const primeiro = chaveEnvioManual('conversa-1', 'membro-1', 'Bom dia', agora);
    const segundo = chaveEnvioManual('conversa-1', 'membro-1', 'Bom dia', agora + 1200);

    expect(primeiro).toBe(segundo);
  });

  it('mandar a mesma frase de propósito, depois, é permitido', () => {
    const agora = 1_700_000_000_000;

    const primeiro = chaveEnvioManual('conversa-1', 'membro-1', 'Bom dia', agora);
    // Passados 30 segundos, é intenção, não clique duplo.
    const depois = chaveEnvioManual('conversa-1', 'membro-1', 'Bom dia', agora + 30_000);

    expect(primeiro).not.toBe(depois);
  });

  it('atendentes diferentes na mesma conversa não colidem', () => {
    const agora = 1_700_000_000_000;

    expect(chaveEnvioManual('conversa-1', 'membro-1', 'Oi', agora)).not.toBe(
      chaveEnvioManual('conversa-1', 'membro-2', 'Oi', agora),
    );
  });

  describe('linha de planilha', () => {
    it('usa o identificador estável quando ele existe', () => {
      const linha = ['João', '11999998888'];

      // A mesma linha, mesmo mudando de posição, continua sendo a mesma.
      expect(chaveLinhaPlanilha('L-42', 10, linha)).toBe(chaveLinhaPlanilha('L-42', 99, linha));
    });

    it('sem identificador, cai para posição mais conteúdo', () => {
      const linha = ['João', '11999998888'];

      expect(chaveLinhaPlanilha(null, 10, linha)).toBe(chaveLinhaPlanilha(null, 10, linha));
      expect(chaveLinhaPlanilha(null, 10, linha)).not.toBe(chaveLinhaPlanilha(null, 11, linha));
    });

    it('linhas diferentes na mesma posição não colidem', () => {
      expect(chaveLinhaPlanilha(null, 5, ['João', '1199'])).not.toBe(
        chaveLinhaPlanilha(null, 5, ['Maria', '1188']),
      );
    });

    it('identificador com espaços em volta é o mesmo identificador', () => {
      expect(chaveLinhaPlanilha('  L-42  ', 1, [])).toBe(chaveLinhaPlanilha('L-42', 1, []));
    });

    it('identificador vazio não é tratado como identificador', () => {
      const linha = ['a', 'b'];
      expect(chaveLinhaPlanilha('   ', 7, linha)).toBe(chaveLinhaPlanilha(null, 7, linha));
    });

    it('o hash do conteúdo detecta alteração na linha', () => {
      expect(hashConteudoLinha(['João', '1199'])).toBe(hashConteudoLinha(['João', '1199']));
      expect(hashConteudoLinha(['João', '1199'])).not.toBe(hashConteudoLinha(['João', '1198']));
    });
  });
});
