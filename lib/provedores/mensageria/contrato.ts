/**
 * Contrato de mensageria.
 *
 * Nenhum outro arquivo da aplicação chama a Evolution API diretamente. O
 * resto do sistema conhece só este contrato — trocar de provedor é
 * escrever uma classe nova aqui dentro e mudar uma linha na fábrica.
 *
 * `interpretarEvento` é a peça que fecha o desacoplamento: cada provedor
 * traduz o formato bruto do seu webhook para `EventoNormalizado`, e o
 * processamento de mensagem nunca vê JSON de fornecedor.
 */
import type { StatusCanal, TipoMensagem } from '@/lib/tipos-banco';

export interface CanalDeEnvio {
  id: string;
  organizacao_id: string;
  identificador_externo: string;
  configuracao?: unknown;
}

export interface ResultadoConexao {
  status: StatusCanal;
  /** Imagem do QR Code em data URI, quando o provedor devolve. */
  qrCodeBase64?: string | null;
  /** Código do "conectar com número de telefone", quando existir. */
  codigo?: string | null;
}

export interface RespostaEnvio {
  /** ID da mensagem no provedor — vira `identificador_externo`. */
  identificadorExterno: string | null;
  enviadoEm: string;
}

export interface MidiaParaEnvio {
  tipo: Extract<TipoMensagem, 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'DOCUMENTO'>;
  /** URL pública OU conteúdo em base64. Um dos dois. */
  url?: string;
  base64?: string;
  nomeArquivo?: string;
  tipoMime?: string;
  legenda?: string;
}

export interface MidiaRecebida {
  tipo: TipoMensagem;
  tipoMime: string | null;
  nomeArquivo: string | null;
  tamanhoBytes: number | null;
  duracaoSegundos: number | null;
  /** Referência opaca usada por `baixarMidia`. */
  referencia: string;
  url?: string | null;
}

export type EventoNormalizado =
  | {
      tipo: 'MENSAGEM_RECEBIDA';
      identificadorEvento: string;
      instancia: string;
      /** Telefone do contato em E.164 sem "+". */
      telefone: string;
      nomeExibicao: string | null;
      tipoMensagem: TipoMensagem;
      texto: string | null;
      midia: MidiaRecebida | null;
      /** Mensagem enviada pelo próprio número (ex.: pelo celular do atendente). */
      doProprioNumero: boolean;
      recebidoEm: string;
      cargaOriginal: unknown;
    }
  | {
      tipo: 'STATUS_MENSAGEM';
      identificadorEvento: string;
      instancia: string;
      identificadorMensagem: string;
      status: 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHOU';
    }
  | {
      tipo: 'STATUS_CONEXAO';
      identificadorEvento: string;
      instancia: string;
      status: StatusCanal;
      qrCodeBase64?: string | null;
      telefone?: string | null;
    }
  | {
      tipo: 'IGNORADO';
      identificadorEvento: string;
      instancia: string;
      motivo: string;
    };

export interface ProvedorMensageria {
  readonly nome: 'EVOLUTION' | 'META_CLOUD' | 'SIMULADO';

  /** Cria a instância no provedor, se ainda não existir. */
  provisionar(canal: CanalDeEnvio, urlWebhook: string): Promise<void>;

  /** Inicia a conexão e devolve o QR Code para leitura no celular. */
  conectar(canal: CanalDeEnvio): Promise<ResultadoConexao>;

  desconectar(canal: CanalDeEnvio): Promise<void>;

  /** Remove a instância no provedor. Usado ao excluir o canal. */
  remover(canal: CanalDeEnvio): Promise<void>;

  statusConexao(canal: CanalDeEnvio): Promise<ResultadoConexao>;

  enviarTexto(canal: CanalDeEnvio, telefone: string, texto: string): Promise<RespostaEnvio>;

  enviarMidia(
    canal: CanalDeEnvio,
    telefone: string,
    midia: MidiaParaEnvio,
  ): Promise<RespostaEnvio>;

  /** Baixa o conteúdo de uma mídia recebida. */
  baixarMidia(canal: CanalDeEnvio, midia: MidiaRecebida): Promise<Buffer>;

  configurarWebhook(canal: CanalDeEnvio, urlWebhook: string): Promise<void>;

  /** Traduz a carga bruta do webhook. Nunca lança: no pior caso devolve IGNORADO. */
  interpretarEvento(carga: unknown): EventoNormalizado;
}

/** Erro vindo do provedor. Carrega se vale a pena tentar de novo. */
export class ErroProvedorMensageria extends Error {
  readonly provedor: string;
  readonly statusHttp: number | null;
  readonly permanente: boolean;

  constructor(
    mensagem: string,
    opcoes: { provedor: string; statusHttp?: number | null; permanente?: boolean },
  ) {
    super(mensagem);
    this.name = 'ErroProvedorMensageria';
    this.provedor = opcoes.provedor;
    this.statusHttp = opcoes.statusHttp ?? null;
    // 4xx é erro nosso (número inválido, instância errada): repetir não
    // resolve e ainda queima a fila. 5xx e rede valem retry.
    this.permanente =
      opcoes.permanente ??
      (typeof opcoes.statusHttp === 'number' && opcoes.statusHttp >= 400 && opcoes.statusHttp < 500);
  }
}
