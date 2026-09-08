/**
 * Contrato do provedor de IA.
 *
 * A aplicação não conhece OpenAI. Ela pede "gere um JSON que obedeça a
 * este esquema" ou "descreva esta imagem", e o provedor resolve. O prompt
 * e a interpretação da resposta ficam em `lib/ia/`, que é lógica de
 * negócio nossa — não do fornecedor.
 */

export interface MensagemIa {
  papel: 'sistema' | 'usuario' | 'assistente';
  conteudo: string;
}

export interface PedidoIa {
  modelo?: string;
  temperatura?: number;
  mensagens: MensagemIa[];
  maxTokens?: number;
}

export interface PedidoIaJson extends PedidoIa {
  /** JSON Schema do formato esperado. */
  esquema: Record<string, unknown>;
  nomeEsquema: string;
}

export interface UsoIa {
  tokensEntrada: number | null;
  tokensSaida: number | null;
  modelo: string;
  latenciaMs: number;
}

export interface RespostaIa<T = string> {
  conteudo: T;
  uso: UsoIa;
}

export interface PedidoDescricaoImagem {
  modelo?: string;
  /** Conteúdo da imagem em base64, sem o prefixo data:. */
  imagemBase64: string;
  tipoMime: string;
  instrucao: string;
}

export interface ProvedorIa {
  readonly nome: string;

  /** Texto livre. Usado em resumo e análise. */
  gerarTexto(pedido: PedidoIa): Promise<RespostaIa<string>>;

  /**
   * Geração com formato garantido. É o que sustenta a conversa: a IA não
   * devolve só texto, devolve a decisão inteira (resposta, dados
   * coletados, transferência) num objeto que a aplicação sabe ler.
   */
  gerarJson(pedido: PedidoIaJson): Promise<RespostaIa<unknown>>;

  /** Leitura de imagem. Nunca afirma autenticidade de documento. */
  descreverImagem(pedido: PedidoDescricaoImagem): Promise<RespostaIa<string>>;
}

export class ErroProvedorIa extends Error {
  readonly provedor: string;
  readonly permanente: boolean;

  constructor(mensagem: string, opcoes: { provedor: string; permanente?: boolean }) {
    super(mensagem);
    this.name = 'ErroProvedorIa';
    this.provedor = opcoes.provedor;
    this.permanente = opcoes.permanente ?? false;
  }
}
