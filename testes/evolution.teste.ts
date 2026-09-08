/**
 * Leitura do webhook da Evolution.
 *
 * O provedor manda formatos variados e muda entre versões. O
 * interpretador NUNCA pode lançar exceção: um erro aqui derruba o
 * webhook, a Evolution reentrega, e a coisa vira tempestade. Carga
 * desconhecida tem de virar evento IGNORADO com motivo.
 */
import { describe, expect, it } from 'vitest';
import { ProvedorEvolution } from '@/lib/provedores/mensageria/evolution';
import { ErroProvedorMensageria } from '@/lib/provedores/mensageria/contrato';

const provedor = new ProvedorEvolution({ url: 'http://localhost:8080', chave: 'chave-de-teste' });

function mensagemUpsert(mensagem: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'empresa-comercial',
    data: {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'MSG-1' },
      pushName: 'Maria',
      messageTimestamp: 1_757_000_000,
      message: mensagem,
      ...extras,
    },
  };
}

describe('interpretarEvento — mensagens', () => {
  it('lê texto simples', () => {
    const evento = provedor.interpretarEvento(mensagemUpsert({ conversation: 'Bom dia' }));

    expect(evento.tipo).toBe('MENSAGEM_RECEBIDA');
    if (evento.tipo !== 'MENSAGEM_RECEBIDA') return;

    expect(evento.telefone).toBe('5511999998888');
    expect(evento.texto).toBe('Bom dia');
    expect(evento.nomeExibicao).toBe('Maria');
    expect(evento.tipoMensagem).toBe('TEXTO');
    expect(evento.doProprioNumero).toBe(false);
  });

  it('lê texto estendido (resposta a outra mensagem)', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert({ extendedTextMessage: { text: 'Isso mesmo' } }),
    );

    expect(evento.tipo).toBe('MENSAGEM_RECEBIDA');
    if (evento.tipo !== 'MENSAGEM_RECEBIDA') return;
    expect(evento.texto).toBe('Isso mesmo');
  });

  it('lê áudio com duração', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 12 } }),
    );

    if (evento.tipo !== 'MENSAGEM_RECEBIDA') throw new Error('esperava mensagem');

    expect(evento.tipoMensagem).toBe('AUDIO');
    expect(evento.midia?.duracaoSegundos).toBe(12);
    expect(evento.midia?.referencia).toBe('MSG-1');
  });

  it('lê imagem com legenda', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert({ imageMessage: { mimetype: 'image/jpeg', caption: 'segue o documento' } }),
    );

    if (evento.tipo !== 'MENSAGEM_RECEBIDA') throw new Error('esperava mensagem');

    expect(evento.tipoMensagem).toBe('IMAGEM');
    expect(evento.texto).toBe('segue o documento');
  });

  it('lê documento com nome de arquivo', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert({
        documentMessage: {
          mimetype: 'application/pdf',
          fileName: 'contrato.pdf',
          fileLength: '20480',
        },
      }),
    );

    if (evento.tipo !== 'MENSAGEM_RECEBIDA') throw new Error('esperava mensagem');

    expect(evento.tipoMensagem).toBe('DOCUMENTO');
    expect(evento.midia?.nomeArquivo).toBe('contrato.pdf');
    expect(evento.midia?.tamanhoBytes).toBe(20480);
  });

  it('desembrulha documento enviado com legenda', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert({
        documentWithCaptionMessage: {
          message: {
            documentMessage: { mimetype: 'application/pdf', fileName: 'cnh.pdf', caption: 'minha CNH' },
          },
        },
      }),
    );

    if (evento.tipo !== 'MENSAGEM_RECEBIDA') throw new Error('esperava mensagem');

    expect(evento.tipoMensagem).toBe('DOCUMENTO');
    expect(evento.midia?.nomeArquivo).toBe('cnh.pdf');
  });

  it('marca mensagem enviada pelo próprio número', () => {
    const evento = provedor.interpretarEvento(
      mensagemUpsert(
        { conversation: 'respondi pelo celular' },
        { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: 'MSG-2' } },
      ),
    );

    if (evento.tipo !== 'MENSAGEM_RECEBIDA') throw new Error('esperava mensagem');
    expect(evento.doProprioNumero).toBe(true);
  });

  it('ignora grupo', () => {
    const evento = provedor.interpretarEvento({
      event: 'messages.upsert',
      instance: 'empresa-comercial',
      data: {
        key: { remoteJid: '12345-67890@g.us', fromMe: false, id: 'G-1' },
        message: { conversation: 'oi pessoal' },
      },
    });

    expect(evento.tipo).toBe('IGNORADO');
  });

  it('ignora status/transmissão', () => {
    const evento = provedor.interpretarEvento({
      event: 'messages.upsert',
      instance: 'empresa-comercial',
      data: {
        key: { remoteJid: 'status@broadcast', fromMe: false, id: 'S-1' },
        message: { conversation: 'status' },
      },
    });

    expect(evento.tipo).toBe('IGNORADO');
  });

  it('ignora mensagem de protocolo sem conteúdo', () => {
    const evento = provedor.interpretarEvento(mensagemUpsert({ protocolMessage: { type: 0 } }));

    expect(evento.tipo).toBe('IGNORADO');
  });

  it('gera o mesmo identificador para a mesma mensagem — base da deduplicação', () => {
    const carga = mensagemUpsert({ conversation: 'oi' });

    const primeiro = provedor.interpretarEvento(carga);
    const segundo = provedor.interpretarEvento(carga);

    expect(primeiro.identificadorEvento).toBe(segundo.identificadorEvento);
    expect(primeiro.identificadorEvento).toBe('empresa-comercial:MSG-1');
  });
});

describe('interpretarEvento — status e conexão', () => {
  it('traduz confirmação de leitura', () => {
    const evento = provedor.interpretarEvento({
      event: 'messages.update',
      instance: 'empresa-comercial',
      data: { key: { id: 'MSG-1' }, status: 'READ' },
    });

    expect(evento.tipo).toBe('STATUS_MENSAGEM');
    if (evento.tipo !== 'STATUS_MENSAGEM') return;
    expect(evento.status).toBe('LIDA');
  });

  it('traduz entrega', () => {
    const evento = provedor.interpretarEvento({
      event: 'messages.update',
      instance: 'x',
      data: { key: { id: 'MSG-1' }, status: 'DELIVERY_ACK' },
    });

    if (evento.tipo !== 'STATUS_MENSAGEM') throw new Error('esperava status');
    expect(evento.status).toBe('ENTREGUE');
  });

  it('ignora status desconhecido em vez de quebrar', () => {
    const evento = provedor.interpretarEvento({
      event: 'messages.update',
      instance: 'x',
      data: { key: { id: 'MSG-1' }, status: 'ALGO_NOVO' },
    });

    expect(evento.tipo).toBe('IGNORADO');
  });

  it('traduz conexão aberta', () => {
    const evento = provedor.interpretarEvento({
      event: 'connection.update',
      instance: 'x',
      data: { state: 'open' },
    });

    if (evento.tipo !== 'STATUS_CONEXAO') throw new Error('esperava conexão');
    expect(evento.status).toBe('CONECTADO');
  });

  it('traduz conexão fechada', () => {
    const evento = provedor.interpretarEvento({
      event: 'connection.update',
      instance: 'x',
      data: { state: 'close' },
    });

    if (evento.tipo !== 'STATUS_CONEXAO') throw new Error('esperava conexão');
    expect(evento.status).toBe('DESCONECTADO');
  });

  it('lê o QR Code e devolve como data URI', () => {
    const evento = provedor.interpretarEvento({
      event: 'qrcode.updated',
      instance: 'x',
      data: { qrcode: { base64: 'AAAA' } },
    });

    if (evento.tipo !== 'STATUS_CONEXAO') throw new Error('esperava conexão');
    expect(evento.status).toBe('AGUARDANDO_QR');
    expect(evento.qrCodeBase64).toBe('data:image/png;base64,AAAA');
  });

  it('não duplica o prefixo de um base64 que já vem como data URI', () => {
    const evento = provedor.interpretarEvento({
      event: 'qrcode.updated',
      instance: 'x',
      data: { qrcode: { base64: 'data:image/png;base64,BBBB' } },
    });

    if (evento.tipo !== 'STATUS_CONEXAO') throw new Error('esperava conexão');
    expect(evento.qrCodeBase64).toBe('data:image/png;base64,BBBB');
  });
});

describe('interpretarEvento — robustez', () => {
  it('nunca lança, mesmo com carga absurda', () => {
    const cargas: unknown[] = [
      null,
      undefined,
      'texto solto',
      42,
      [],
      {},
      { event: 'messages.upsert' },
      { event: 'messages.upsert', instance: 'x', data: null },
      { event: 'evento.que.nao.existe', instance: 'x', data: {} },
      { event: 'messages.upsert', instance: 'x', data: { key: null, message: null } },
    ];

    for (const carga of cargas) {
      expect(() => provedor.interpretarEvento(carga)).not.toThrow();
      expect(provedor.interpretarEvento(carga).tipo).toBe('IGNORADO');
    }
  });
});

describe('classificação de erro do provedor', () => {
  it('4xx é erro permanente: repetir não conserta', () => {
    const erro = new ErroProvedorMensageria('número inválido', {
      provedor: 'EVOLUTION',
      statusHttp: 400,
    });

    expect(erro.permanente).toBe(true);
  });

  it('5xx vale nova tentativa', () => {
    const erro = new ErroProvedorMensageria('indisponível', {
      provedor: 'EVOLUTION',
      statusHttp: 503,
    });

    expect(erro.permanente).toBe(false);
  });

  it('falha de rede vale nova tentativa', () => {
    const erro = new ErroProvedorMensageria('timeout', { provedor: 'EVOLUTION' });

    expect(erro.permanente).toBe(false);
  });
});
