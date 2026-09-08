/**
 * Provedor de IA simulado.
 *
 * Permite exercitar todo o caminho da conversa (contexto montado, decisão
 * interpretada, mensagem gravada, estado transicionado) sem chave de API e
 * sem custo. É o que os testes usam.
 *
 * A resposta é fixa e declaradamente artificial: não tenta imitar
 * inteligência, só devolve um objeto no formato combinado. Se alguém rodar
 * a aplicação sem configurar a IA, a resposta deixa isso evidente na tela
 * em vez de fingir um atendimento.
 */
import {
  type PedidoDescricaoImagem,
  type PedidoIa,
  type PedidoIaJson,
  type ProvedorIa,
  type RespostaIa,
} from './contrato';

export type RespondedorSimulado = (pedido: PedidoIaJson) => unknown;

export class ProvedorIaSimulado implements ProvedorIa {
  readonly nome = 'SIMULADO';

  /** Permite ao teste definir a resposta do próximo `gerarJson`. */
  respondedor: RespondedorSimulado | null = null;

  readonly pedidos: (PedidoIa | PedidoIaJson)[] = [];

  private uso(inicio: number) {
    return {
      tokensEntrada: 0,
      tokensSaida: 0,
      modelo: 'simulado',
      latenciaMs: Date.now() - inicio,
    };
  }

  async gerarTexto(pedido: PedidoIa): Promise<RespostaIa<string>> {
    const inicio = Date.now();
    this.pedidos.push(pedido);
    return {
      conteudo: '[IA simulada] Nenhum provedor de IA está configurado.',
      uso: this.uso(inicio),
    };
  }

  async gerarJson(pedido: PedidoIaJson): Promise<RespostaIa<unknown>> {
    const inicio = Date.now();
    this.pedidos.push(pedido);

    if (this.respondedor) {
      return { conteudo: this.respondedor(pedido), uso: this.uso(inicio) };
    }

    return {
      conteudo: {
        resposta:
          '[IA simulada] Nenhum provedor de IA está configurado. Um atendente vai continuar daqui.',
        precisa_humano: true,
        motivo_humano: 'Provedor de IA não configurado',
        departamento_sugerido: null,
        dados_coletados: [],
        memorias: [],
        resumo_atualizado: null,
        confianca: 0,
      },
      uso: this.uso(inicio),
    };
  }

  async descreverImagem(pedido: PedidoDescricaoImagem): Promise<RespostaIa<string>> {
    const inicio = Date.now();
    return {
      conteudo: `[IA simulada] Imagem ${pedido.tipoMime} recebida, sem análise: provedor de IA não configurado.`,
      uso: this.uso(inicio),
    };
  }

  limpar(): void {
    this.pedidos.length = 0;
    this.respondedor = null;
  }
}
