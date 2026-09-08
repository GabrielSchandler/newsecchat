/**
 * Provedor de IA: OpenAI.
 *
 * Único arquivo que conhece o SDK da OpenAI. A saída estruturada usa
 * `response_format: json_schema` com `strict`, que é o que garante que a
 * resposta chega no formato combinado em vez de "quase JSON" — e evita
 * ter de escrever um interpretador tolerante para texto de modelo.
 */
import OpenAI from 'openai';
import { ambienteServidor } from '@/lib/ambiente';
import {
  ErroProvedorIa,
  type PedidoDescricaoImagem,
  type PedidoIa,
  type PedidoIaJson,
  type ProvedorIa,
  type RespostaIa,
  type MensagemIa,
} from './contrato';

function traduzirPapel(papel: MensagemIa['papel']): 'system' | 'user' | 'assistant' {
  if (papel === 'sistema') return 'system';
  if (papel === 'assistente') return 'assistant';
  return 'user';
}

export class ProvedorOpenAI implements ProvedorIa {
  readonly nome = 'OPENAI';

  private readonly cliente: OpenAI;
  private readonly modeloPadrao: string;

  constructor(opcoes: { chave: string; modeloPadrao?: string }) {
    this.cliente = new OpenAI({ apiKey: opcoes.chave, maxRetries: 1, timeout: 60_000 });
    this.modeloPadrao = opcoes.modeloPadrao ?? ambienteServidor.openaiModeloConversa;
  }

  async gerarTexto(pedido: PedidoIa): Promise<RespostaIa<string>> {
    const inicio = Date.now();
    const modelo = pedido.modelo ?? this.modeloPadrao;

    try {
      const resposta = await this.cliente.chat.completions.create({
        model: modelo,
        temperature: pedido.temperatura ?? 0.4,
        max_tokens: pedido.maxTokens ?? 1200,
        messages: pedido.mensagens.map((mensagem) => ({
          role: traduzirPapel(mensagem.papel),
          content: mensagem.conteudo,
        })),
      });

      return {
        conteudo: resposta.choices[0]?.message?.content ?? '',
        uso: {
          tokensEntrada: resposta.usage?.prompt_tokens ?? null,
          tokensSaida: resposta.usage?.completion_tokens ?? null,
          modelo,
          latenciaMs: Date.now() - inicio,
        },
      };
    } catch (erro) {
      throw this.traduzirErro(erro);
    }
  }

  async gerarJson(pedido: PedidoIaJson): Promise<RespostaIa<unknown>> {
    const inicio = Date.now();
    const modelo = pedido.modelo ?? this.modeloPadrao;

    try {
      const resposta = await this.cliente.chat.completions.create({
        model: modelo,
        temperature: pedido.temperatura ?? 0.4,
        max_tokens: pedido.maxTokens ?? 1500,
        messages: pedido.mensagens.map((mensagem) => ({
          role: traduzirPapel(mensagem.papel),
          content: mensagem.conteudo,
        })),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: pedido.nomeEsquema,
            strict: true,
            schema: pedido.esquema,
          },
        },
      });

      const texto = resposta.choices[0]?.message?.content ?? '';
      if (!texto) {
        throw new ErroProvedorIa('A IA devolveu resposta vazia.', {
          provedor: this.nome,
          permanente: false,
        });
      }

      let conteudo: unknown;
      try {
        conteudo = JSON.parse(texto);
      } catch {
        throw new ErroProvedorIa('A IA devolveu um JSON inválido.', {
          provedor: this.nome,
          permanente: false,
        });
      }

      return {
        conteudo,
        uso: {
          tokensEntrada: resposta.usage?.prompt_tokens ?? null,
          tokensSaida: resposta.usage?.completion_tokens ?? null,
          modelo,
          latenciaMs: Date.now() - inicio,
        },
      };
    } catch (erro) {
      throw this.traduzirErro(erro);
    }
  }

  async descreverImagem(pedido: PedidoDescricaoImagem): Promise<RespostaIa<string>> {
    const inicio = Date.now();
    const modelo = pedido.modelo ?? ambienteServidor.openaiModeloAnalise;

    try {
      const resposta = await this.cliente.chat.completions.create({
        model: modelo,
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: pedido.instrucao },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${pedido.tipoMime};base64,${pedido.imagemBase64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
      });

      return {
        conteudo: resposta.choices[0]?.message?.content ?? '',
        uso: {
          tokensEntrada: resposta.usage?.prompt_tokens ?? null,
          tokensSaida: resposta.usage?.completion_tokens ?? null,
          modelo,
          latenciaMs: Date.now() - inicio,
        },
      };
    } catch (erro) {
      throw this.traduzirErro(erro);
    }
  }

  private traduzirErro(erro: unknown): ErroProvedorIa {
    if (erro instanceof ErroProvedorIa) return erro;

    if (erro instanceof OpenAI.APIError) {
      // 401/403 são chave errada, 400 é pedido malformado: repetir não
      // conserta nenhum dos dois. 429 e 5xx valem nova tentativa.
      const permanente = erro.status === 400 || erro.status === 401 || erro.status === 403;
      const explicacao =
        erro.status === 401
          ? 'Chave da OpenAI recusada. Confira OPENAI_API_KEY no .env.local.'
          : erro.status === 429
            ? 'Limite de uso da OpenAI atingido. A tentativa será repetida.'
            : erro.message;
      return new ErroProvedorIa(`OpenAI ${erro.status ?? ''}: ${explicacao}`, {
        provedor: this.nome,
        permanente,
      });
    }

    return new ErroProvedorIa(
      `Falha ao falar com a OpenAI: ${erro instanceof Error ? erro.message : String(erro)}`,
      { provedor: this.nome, permanente: false },
    );
  }
}
