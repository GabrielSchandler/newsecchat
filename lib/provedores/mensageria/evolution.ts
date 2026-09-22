/**
 * Provedor de mensageria: Evolution API (v2).
 *
 * Único arquivo da aplicação que conhece o formato da Evolution. Se
 * amanhã o número migrar para a Cloud API da Meta, o que muda é este
 * arquivo e uma linha na fábrica — nada mais.
 *
 * Sobre a leitura do webhook: a Evolution mudou o formato entre a v1 e a
 * v2 em alguns pontos (texto simples, mídia, status). O interpretador
 * abaixo aceita as duas formas onde a diferença é barata de cobrir, e
 * nunca lança exceção: carga desconhecida vira evento IGNORADO com
 * motivo, que fica registrado para investigação.
 */
import { z } from 'zod';
import {
  ErroProvedorMensageria,
  type CanalDeEnvio,
  type EventoNormalizado,
  type MidiaParaEnvio,
  type MidiaRecebida,
  type ProvedorMensageria,
  type ResultadoConexao,
  type RespostaEnvio,
} from './contrato';
import { telefoneDoIdentificadorWhatsapp, normalizarTelefone } from '@/lib/nucleo/telefone';
import type { StatusCanal, TipoMensagem } from '@/lib/tipos-banco';
import { log } from '@/lib/log';

const TEMPO_LIMITE_MS = 20_000;

interface OpcoesEvolution {
  url: string;
  chave: string;
}

export class ProvedorEvolution implements ProvedorMensageria {
  readonly nome = 'EVOLUTION' as const;

  private readonly url: string;
  private readonly chave: string;

  constructor(opcoes: OpcoesEvolution) {
    this.url = opcoes.url.replace(/\/+$/, '');
    this.chave = opcoes.chave;
  }

  private async chamar<T>(
    caminho: string,
    opcoes: { metodo?: string; corpo?: unknown; aceitar404?: boolean } = {},
  ): Promise<T | null> {
    const { metodo = 'GET', corpo, aceitar404 = false } = opcoes;
    const controlador = new AbortController();
    const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

    try {
      const resposta = await fetch(`${this.url}${caminho}`, {
        method: metodo,
        headers: {
          apikey: this.chave,
          'Content-Type': 'application/json',
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controlador.signal,
      });

      if (resposta.status === 404 && aceitar404) return null;

      const texto = await resposta.text();
      let dados: unknown = null;
      try {
        dados = texto ? JSON.parse(texto) : null;
      } catch {
        dados = texto;
      }

      if (!resposta.ok) {
        throw new ErroProvedorMensageria(
          `Evolution API respondeu ${resposta.status} em ${caminho}: ${
            typeof dados === 'string' ? dados.slice(0, 300) : JSON.stringify(dados).slice(0, 300)
          }`,
          { provedor: 'EVOLUTION', statusHttp: resposta.status },
        );
      }

      return dados as T;
    } catch (erro) {
      if (erro instanceof ErroProvedorMensageria) throw erro;
      if (erro instanceof Error && erro.name === 'AbortError') {
        throw new ErroProvedorMensageria(
          `Evolution API não respondeu em ${TEMPO_LIMITE_MS / 1000}s (${caminho}). Confira se o servidor está no ar.`,
          { provedor: 'EVOLUTION', permanente: false },
        );
      }
      throw new ErroProvedorMensageria(
        `Não foi possível falar com a Evolution API (${caminho}): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
        { provedor: 'EVOLUTION', permanente: false },
      );
    } finally {
      clearTimeout(relogio);
    }
  }

  async provisionar(canal: CanalDeEnvio, urlWebhook: string): Promise<void> {
    const existente = await this.chamar<unknown>(
      `/instance/connectionState/${encodeURIComponent(canal.identificador_externo)}`,
      { aceitar404: true },
    );

    if (existente) {
      await this.configurarWebhook(canal, urlWebhook);
      return;
    }

    await this.chamar('/instance/create', {
      metodo: 'POST',
      corpo: {
        instanceName: canal.identificador_externo,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: urlWebhook,
          byEvents: false,
          base64: true,
          events: EVENTOS_ASSINADOS,
        },
      },
    });
  }

  async configurarWebhook(canal: CanalDeEnvio, urlWebhook: string): Promise<void> {
    await this.chamar(`/webhook/set/${encodeURIComponent(canal.identificador_externo)}`, {
      metodo: 'POST',
      corpo: {
        webhook: {
          enabled: true,
          url: urlWebhook,
          byEvents: false,
          base64: true,
          events: EVENTOS_ASSINADOS,
        },
      },
    });
  }

  async conectar(canal: CanalDeEnvio): Promise<ResultadoConexao> {
    const resposta = await this.chamar<Record<string, unknown>>(
      `/instance/connect/${encodeURIComponent(canal.identificador_externo)}`,
    );

    const base64 = lerTexto(resposta, ['base64']) ?? lerTexto(resposta, ['qrcode', 'base64']);
    const codigo = lerTexto(resposta, ['code']) ?? lerTexto(resposta, ['pairingCode']);
    const estado = lerTexto(resposta, ['instance', 'state']);

    return {
      status: estado ? traduzirEstado(estado) : 'AGUARDANDO_QR',
      qrCodeBase64: base64 ? garantirDataUri(base64) : null,
      codigo: codigo ?? null,
    };
  }

  async desconectar(canal: CanalDeEnvio): Promise<void> {
    await this.chamar(`/instance/logout/${encodeURIComponent(canal.identificador_externo)}`, {
      metodo: 'DELETE',
      aceitar404: true,
    });
  }

  async remover(canal: CanalDeEnvio): Promise<void> {
    await this.desconectar(canal).catch(() => undefined);
    await this.chamar(`/instance/delete/${encodeURIComponent(canal.identificador_externo)}`, {
      metodo: 'DELETE',
      aceitar404: true,
    });
  }

  async statusConexao(canal: CanalDeEnvio): Promise<ResultadoConexao> {
    const resposta = await this.chamar<Record<string, unknown>>(
      `/instance/connectionState/${encodeURIComponent(canal.identificador_externo)}`,
      { aceitar404: true },
    );

    if (!resposta) return { status: 'DESCONECTADO' };

    const estado = lerTexto(resposta, ['instance', 'state']) ?? lerTexto(resposta, ['state']);
    return { status: estado ? traduzirEstado(estado) : 'DESCONECTADO' };
  }

  async enviarTexto(canal: CanalDeEnvio, telefone: string, texto: string): Promise<RespostaEnvio> {
    const numero = normalizarTelefone(telefone);
    if (!numero) {
      throw new ErroProvedorMensageria(`Telefone inválido para envio: ${telefone}`, {
        provedor: 'EVOLUTION',
        permanente: true,
      });
    }

    const resposta = await this.chamar<Record<string, unknown>>(
      `/message/sendText/${encodeURIComponent(canal.identificador_externo)}`,
      { metodo: 'POST', corpo: { number: numero, text: texto } },
    );

    return {
      identificadorExterno: lerTexto(resposta, ['key', 'id']),
      enviadoEm: new Date().toISOString(),
    };
  }

  async enviarMidia(
    canal: CanalDeEnvio,
    telefone: string,
    midia: MidiaParaEnvio,
  ): Promise<RespostaEnvio> {
    const numero = normalizarTelefone(telefone);
    if (!numero) {
      throw new ErroProvedorMensageria(`Telefone inválido para envio: ${telefone}`, {
        provedor: 'EVOLUTION',
        permanente: true,
      });
    }

    const conteudo = midia.url ?? midia.base64;
    if (!conteudo) {
      throw new ErroProvedorMensageria('Mídia sem URL nem conteúdo base64.', {
        provedor: 'EVOLUTION',
        permanente: true,
      });
    }

    // Áudio de voz tem endpoint próprio: enviado por sendMedia ele chega
    // como arquivo anexado em vez de mensagem de voz.
    if (midia.tipo === 'AUDIO') {
      const resposta = await this.chamar<Record<string, unknown>>(
        `/message/sendWhatsAppAudio/${encodeURIComponent(canal.identificador_externo)}`,
        { metodo: 'POST', corpo: { number: numero, audio: conteudo } },
      );
      return {
        identificadorExterno: lerTexto(resposta, ['key', 'id']),
        enviadoEm: new Date().toISOString(),
      };
    }

    const resposta = await this.chamar<Record<string, unknown>>(
      `/message/sendMedia/${encodeURIComponent(canal.identificador_externo)}`,
      {
        metodo: 'POST',
        corpo: {
          number: numero,
          mediatype: midia.tipo === 'IMAGEM' ? 'image' : midia.tipo === 'VIDEO' ? 'video' : 'document',
          mimetype: midia.tipoMime,
          media: conteudo,
          fileName: midia.nomeArquivo,
          caption: midia.legenda,
        },
      },
    );

    return {
      identificadorExterno: lerTexto(resposta, ['key', 'id']),
      enviadoEm: new Date().toISOString(),
    };
  }

  async baixarMidia(canal: CanalDeEnvio, midia: MidiaRecebida): Promise<Buffer> {
    // Caminho preferido: a própria Evolution devolve o conteúdo já
    // descriptografado. Baixar a URL crua do WhatsApp não funciona — o
    // arquivo é cifrado.
    const resposta = await this.chamar<Record<string, unknown>>(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(canal.identificador_externo)}`,
      {
        metodo: 'POST',
        corpo: { message: { key: { id: midia.referencia } }, convertToMp4: false },
      },
    );

    const base64 = lerTexto(resposta, ['base64']) ?? lerTexto(resposta, ['media']);
    if (!base64) {
      throw new ErroProvedorMensageria(
        'A Evolution não devolveu o conteúdo da mídia. A mensagem pode ter expirado no WhatsApp.',
        { provedor: 'EVOLUTION', permanente: true },
      );
    }

    return Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }

  async buscarFotoPerfil(canal: CanalDeEnvio, telefone: string): Promise<string | null> {
    const numero = normalizarTelefone(telefone);
    if (!numero) return null;

    // A Evolution devolve 404 (via aceitar404) para número sem WhatsApp
    // ou instância desconectada; erro de rede sobe normalmente — quem
    // chama decide se tenta de novo.
    const resposta = await this.chamar<Record<string, unknown>>(
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(canal.identificador_externo)}`,
      { metodo: 'POST', corpo: { number: numero }, aceitar404: true },
    );

    return lerTexto(resposta, ['profilePictureUrl']);
  }

  interpretarEvento(carga: unknown): EventoNormalizado {
    try {
      return interpretar(carga);
    } catch (erro) {
      log.warn('Falha ao interpretar evento da Evolution', { erro: String(erro) });
      return {
        tipo: 'IGNORADO',
        identificadorEvento: `desconhecido-${Date.now()}`,
        instancia: '',
        motivo: 'Carga não reconhecida',
      };
    }
  }
}

// ---------------------------------------------------------------------
// Interpretação da carga
// ---------------------------------------------------------------------

const EVENTOS_ASSINADOS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
];

const esquemaEnvelope = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  data: z.unknown().optional(),
  sender: z.string().optional(),
});

function interpretar(carga: unknown): EventoNormalizado {
  const envelope = esquemaEnvelope.safeParse(carga);
  if (!envelope.success) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento: `invalido-${Date.now()}`,
      instancia: '',
      motivo: 'Envelope fora do formato esperado',
    };
  }

  const evento = (envelope.data.event ?? '').toLowerCase().replace(/_/g, '.');
  const instancia = envelope.data.instance ?? '';
  const dados = envelope.data.data as Record<string, unknown> | undefined;

  if (!dados) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento: `${instancia}-${evento}-${Date.now()}`,
      instancia,
      motivo: 'Evento sem dados',
    };
  }

  if (evento === 'messages.upsert') return interpretarMensagem(instancia, dados, carga);
  if (evento === 'messages.update') return interpretarStatus(instancia, dados);
  if (evento === 'connection.update') return interpretarConexao(instancia, dados);
  if (evento === 'qrcode.updated') return interpretarQrCode(instancia, dados);

  return {
    tipo: 'IGNORADO',
    identificadorEvento: `${instancia}-${evento}-${Date.now()}`,
    instancia,
    motivo: `Evento não tratado: ${evento || 'sem nome'}`,
  };
}

function interpretarMensagem(
  instancia: string,
  dados: Record<string, unknown>,
  cargaOriginal: unknown,
): EventoNormalizado {
  const chave = dados.key as Record<string, unknown> | undefined;
  const identificadorMensagem = typeof chave?.id === 'string' ? chave.id : null;
  const remoteJid = typeof chave?.remoteJid === 'string' ? chave.remoteJid : '';
  const doProprioNumero = chave?.fromMe === true;

  const identificadorEvento = identificadorMensagem
    ? `${instancia}:${identificadorMensagem}`
    : `${instancia}:upsert:${Date.now()}`;

  const telefone = telefoneDoIdentificadorWhatsapp(remoteJid);
  if (!telefone) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento,
      instancia,
      motivo: 'Origem não é um contato individual (grupo, transmissão ou status)',
    };
  }

  const mensagem = (dados.message ?? {}) as Record<string, unknown>;
  const { tipo, texto, midia } = extrairConteudo(mensagem, identificadorMensagem ?? '');

  if (tipo === 'SISTEMA' && !texto && !midia) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento,
      instancia,
      motivo: 'Mensagem sem conteúdo aproveitável (protocolo ou reação)',
    };
  }

  const marcaTempo = Number(dados.messageTimestamp ?? 0);

  return {
    tipo: 'MENSAGEM_RECEBIDA',
    identificadorEvento,
    instancia,
    telefone,
    nomeExibicao: typeof dados.pushName === 'string' ? dados.pushName : null,
    tipoMensagem: tipo,
    texto,
    midia,
    doProprioNumero,
    recebidoEm: marcaTempo
      ? new Date(marcaTempo * 1000).toISOString()
      : new Date().toISOString(),
    cargaOriginal,
  };
}

interface ConteudoExtraido {
  tipo: TipoMensagem;
  texto: string | null;
  midia: MidiaRecebida | null;
}

function extrairConteudo(
  mensagem: Record<string, unknown>,
  identificadorMensagem: string,
): ConteudoExtraido {
  if (typeof mensagem.conversation === 'string') {
    return { tipo: 'TEXTO', texto: mensagem.conversation, midia: null };
  }

  const estendida = mensagem.extendedTextMessage as Record<string, unknown> | undefined;
  if (estendida && typeof estendida.text === 'string') {
    return { tipo: 'TEXTO', texto: estendida.text, midia: null };
  }

  const mapa: [string, TipoMensagem][] = [
    ['imageMessage', 'IMAGEM'],
    ['audioMessage', 'AUDIO'],
    ['videoMessage', 'VIDEO'],
    ['documentMessage', 'DOCUMENTO'],
    ['documentWithCaptionMessage', 'DOCUMENTO'],
    ['stickerMessage', 'STICKER'],
  ];

  for (const [campo, tipo] of mapa) {
    const bruto = mensagem[campo] as Record<string, unknown> | undefined;
    if (!bruto) continue;

    // documentWithCaptionMessage embrulha o documento de verdade.
    const conteudo =
      campo === 'documentWithCaptionMessage'
        ? ((bruto.message as Record<string, unknown>)?.documentMessage as
            | Record<string, unknown>
            | undefined) ?? bruto
        : bruto;

    return {
      tipo,
      texto: typeof conteudo.caption === 'string' ? conteudo.caption : null,
      midia: {
        tipo,
        tipoMime: typeof conteudo.mimetype === 'string' ? conteudo.mimetype : null,
        nomeArquivo: typeof conteudo.fileName === 'string' ? conteudo.fileName : null,
        tamanhoBytes: conteudo.fileLength ? Number(conteudo.fileLength) : null,
        duracaoSegundos: conteudo.seconds ? Number(conteudo.seconds) : null,
        referencia: identificadorMensagem,
        url: typeof conteudo.url === 'string' ? conteudo.url : null,
      },
    };
  }

  const localizacao = mensagem.locationMessage as Record<string, unknown> | undefined;
  if (localizacao) {
    const latitude = localizacao.degreesLatitude;
    const longitude = localizacao.degreesLongitude;
    return {
      tipo: 'LOCALIZACAO',
      texto: `Localização enviada: ${latitude}, ${longitude}`,
      midia: null,
    };
  }

  const contato = mensagem.contactMessage as Record<string, unknown> | undefined;
  if (contato) {
    return {
      tipo: 'CONTATO',
      texto:
        typeof contato.displayName === 'string'
          ? `Contato enviado: ${contato.displayName}`
          : 'Contato enviado',
      midia: null,
    };
  }

  return { tipo: 'SISTEMA', texto: null, midia: null };
}

function interpretarStatus(instancia: string, dados: Record<string, unknown>): EventoNormalizado {
  const chave = dados.key as Record<string, unknown> | undefined;
  const identificadorMensagem = typeof chave?.id === 'string' ? chave.id : null;
  const status = String(dados.status ?? '').toUpperCase();

  if (!identificadorMensagem) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento: `${instancia}:update:${Date.now()}`,
      instancia,
      motivo: 'Atualização de status sem id de mensagem',
    };
  }

  const traducao: Record<string, 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHOU'> = {
    PENDING: 'ENVIADA',
    SERVER_ACK: 'ENVIADA',
    DELIVERY_ACK: 'ENTREGUE',
    READ: 'LIDA',
    PLAYED: 'LIDA',
    ERROR: 'FALHOU',
  };

  const traduzido = traducao[status];
  if (!traduzido) {
    return {
      tipo: 'IGNORADO',
      identificadorEvento: `${instancia}:update:${identificadorMensagem}:${status}`,
      instancia,
      motivo: `Status não mapeado: ${status}`,
    };
  }

  return {
    tipo: 'STATUS_MENSAGEM',
    identificadorEvento: `${instancia}:update:${identificadorMensagem}:${traduzido}`,
    instancia,
    identificadorMensagem,
    status: traduzido,
  };
}

function interpretarConexao(instancia: string, dados: Record<string, unknown>): EventoNormalizado {
  const estado = String(dados.state ?? dados.connection ?? '');
  return {
    tipo: 'STATUS_CONEXAO',
    identificadorEvento: `${instancia}:conexao:${estado}:${Date.now()}`,
    instancia,
    status: traduzirEstado(estado),
    telefone:
      typeof dados.wuid === 'string' ? telefoneDoIdentificadorWhatsapp(dados.wuid) : null,
  };
}

function interpretarQrCode(instancia: string, dados: Record<string, unknown>): EventoNormalizado {
  const qr = dados.qrcode as Record<string, unknown> | undefined;
  const base64 =
    (typeof qr?.base64 === 'string' ? qr.base64 : null) ??
    (typeof dados.base64 === 'string' ? dados.base64 : null);

  return {
    tipo: 'STATUS_CONEXAO',
    identificadorEvento: `${instancia}:qr:${Date.now()}`,
    instancia,
    status: 'AGUARDANDO_QR',
    qrCodeBase64: base64 ? garantirDataUri(base64) : null,
  };
}

function traduzirEstado(estado: string): StatusCanal {
  switch (estado.toLowerCase()) {
    case 'open':
    case 'connected':
      return 'CONECTADO';
    case 'connecting':
      return 'CONECTANDO';
    case 'close':
    case 'closed':
      return 'DESCONECTADO';
    default:
      return 'DESCONECTADO';
  }
}

function garantirDataUri(valor: string): string {
  return valor.startsWith('data:') ? valor : `data:image/png;base64,${valor}`;
}

/** Lê um caminho aninhado devolvendo texto, ou null. */
function lerTexto(objeto: unknown, caminho: string[]): string | null {
  let atual: unknown = objeto;
  for (const parte of caminho) {
    if (!atual || typeof atual !== 'object') return null;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return typeof atual === 'string' ? atual : null;
}
