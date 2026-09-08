/**
 * Transcrição de áudio.
 *
 * Separado do provedor de conversa de propósito: transcrição e geração de
 * texto são serviços diferentes e é comum uma empresa querer um provedor
 * para cada (custo, idioma, privacidade). Hoje as duas implementações
 * apontam para a OpenAI, mas trocar uma não mexe na outra.
 */
import OpenAI, { toFile } from 'openai';
import { ambienteServidor, integracaoConfigurada } from '@/lib/ambiente';

export interface PedidoTranscricao {
  conteudo: Buffer;
  nomeArquivo: string;
  tipoMime: string;
  /** Dica de idioma no formato ISO-639-1. */
  idioma?: string;
}

export interface ResultadoTranscricao {
  texto: string;
  provedor: string;
  latenciaMs: number;
}

export interface ProvedorTranscricao {
  readonly nome: string;
  readonly disponivel: boolean;
  transcrever(pedido: PedidoTranscricao): Promise<ResultadoTranscricao>;
}

class TranscricaoOpenAI implements ProvedorTranscricao {
  readonly nome = 'OPENAI';
  readonly disponivel = true;

  private readonly cliente: OpenAI;

  constructor(chave: string) {
    this.cliente = new OpenAI({ apiKey: chave, maxRetries: 1, timeout: 120_000 });
  }

  async transcrever(pedido: PedidoTranscricao): Promise<ResultadoTranscricao> {
    const inicio = Date.now();

    const arquivo = await toFile(pedido.conteudo, pedido.nomeArquivo, {
      type: pedido.tipoMime,
    });

    const resposta = await this.cliente.audio.transcriptions.create({
      file: arquivo,
      model: ambienteServidor.openaiModeloTranscricao,
      language: pedido.idioma ?? 'pt',
    });

    return {
      texto: resposta.text ?? '',
      provedor: this.nome,
      latenciaMs: Date.now() - inicio,
    };
  }
}

class TranscricaoIndisponivel implements ProvedorTranscricao {
  readonly nome = 'INDISPONIVEL';
  readonly disponivel = false;

  async transcrever(): Promise<ResultadoTranscricao> {
    throw new Error(
      'Transcrição de áudio indisponível: OPENAI_API_KEY não configurada. O áudio fica guardado e o atendente pode ouvi-lo normalmente.',
    );
  }
}

let instancia: ProvedorTranscricao | null = null;

export function obterProvedorTranscricao(): ProvedorTranscricao {
  if (instancia) return instancia;

  instancia = integracaoConfigurada('IA')
    ? new TranscricaoOpenAI(ambienteServidor.openaiChave)
    : new TranscricaoIndisponivel();

  return instancia;
}

export function _definirProvedorTranscricao(provedor: ProvedorTranscricao | null): void {
  instancia = provedor;
}
