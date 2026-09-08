/**
 * Formato da decisão da IA.
 *
 * A IA não devolve texto solto: devolve um objeto com a resposta, o que
 * aprendeu na conversa e o que quer fazer em seguida. Isso é o que
 * permite gravar dado estruturado, atualizar memória e decidir
 * transferência sem interpretar frase livre com expressão regular.
 *
 * O mesmo formato aparece duas vezes: como JSON Schema (o que o provedor
 * recebe) e como esquema Zod (o que a aplicação usa para conferir o que
 * voltou). Modelo obedece quase sempre — "quase" é o motivo da segunda
 * conferência.
 */
import { z } from 'zod';

export const esquemaDecisaoIa = z.object({
  /** O que dizer ao cliente. Vazio quando a IA só transfere. */
  resposta: z.string().nullable(),
  precisa_humano: z.boolean(),
  motivo_humano: z.string().nullable(),
  /** Chave do departamento, conforme a lista oferecida no prompt. */
  departamento_sugerido: z.string().nullable(),
  dados_coletados: z
    .array(
      z.object({
        campo: z.string(),
        valor: z.string(),
      }),
    )
    .default([]),
  memorias: z
    .array(
      z.object({
        chave: z.string(),
        tipo: z.enum(['FATO', 'PREFERENCIA', 'OBJECAO', 'EVENTO', 'RESTRICAO']),
        conteudo: z.string(),
      }),
    )
    .default([]),
  /** Resumo incremental do contato, reescrito por inteiro quando muda. */
  resumo_atualizado: z.string().nullable(),
  /** 0 a 1. Abaixo do limite, a conversa vai para uma pessoa. */
  confianca: z.number().min(0).max(1),
});

export type DecisaoIa = z.infer<typeof esquemaDecisaoIa>;

/**
 * JSON Schema equivalente.
 *
 * `strict` da OpenAI exige `additionalProperties: false` e TODAS as
 * propriedades em `required` — campo opcional se expressa aceitando null,
 * não omitindo da lista.
 */
export const esquemaDecisaoJson: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'resposta',
    'precisa_humano',
    'motivo_humano',
    'departamento_sugerido',
    'dados_coletados',
    'memorias',
    'resumo_atualizado',
    'confianca',
  ],
  properties: {
    resposta: {
      type: ['string', 'null'],
      description:
        'Mensagem para enviar ao cliente agora, no tom configurado. Null apenas quando a conversa vai para um humano sem nada a dizer antes.',
    },
    precisa_humano: {
      type: 'boolean',
      description: 'true quando a conversa deve sair da IA e ir para uma pessoa.',
    },
    motivo_humano: {
      type: ['string', 'null'],
      description: 'Explicação curta do porquê da transferência, para o atendente ler.',
    },
    departamento_sugerido: {
      type: ['string', 'null'],
      description: 'Chave do departamento de destino, exatamente como aparece na lista fornecida.',
    },
    dados_coletados: {
      type: 'array',
      description: 'Campos que a mensagem do cliente permitiu preencher agora.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['campo', 'valor'],
        properties: {
          campo: { type: 'string', description: 'Chave do campo, como na lista fornecida.' },
          valor: { type: 'string' },
        },
      },
    },
    memorias: {
      type: 'array',
      description:
        'Fatos duráveis sobre o contato que valem para conversas futuras. Não repetir o que já está na memória.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chave', 'tipo', 'conteudo'],
        properties: {
          chave: {
            type: 'string',
            description: 'Identificador curto e estável, em minúsculas, ex.: "prazo_desejado".',
          },
          tipo: {
            type: 'string',
            enum: ['FATO', 'PREFERENCIA', 'OBJECAO', 'EVENTO', 'RESTRICAO'],
          },
          conteudo: { type: 'string' },
        },
      },
    },
    resumo_atualizado: {
      type: ['string', 'null'],
      description:
        'Resumo completo e atualizado do contato, em até 6 linhas. Null se nada mudou desde o resumo atual.',
    },
    confianca: {
      type: 'number',
      description: 'Confiança na própria resposta, de 0 a 1.',
    },
  },
};

// ---------------------------------------------------------------------
// Análise de atendimentos
// ---------------------------------------------------------------------

export const esquemaAnaliseIa = z.object({
  resumo: z.string(),
  achados: z
    .array(
      z.object({
        tipo: z.enum([
          'INSTRUCAO',
          'BASE_CONHECIMENTO',
          'PERGUNTA',
          'CAMPO',
          'TRANSFERENCIA',
          'OBJECAO',
        ]),
        titulo: z.string(),
        descricao: z.string(),
        ocorrencias: z.number().int().min(0),
        evidencias: z.array(z.string()).default([]),
        texto_sugerido: z.string().nullable(),
        campo_alvo: z.string().nullable(),
      }),
    )
    .default([]),
});

export type AnaliseIa = z.infer<typeof esquemaAnaliseIa>;

export const esquemaAnaliseJson: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'achados'],
  properties: {
    resumo: {
      type: 'string',
      description: 'Panorama do período em até 8 linhas, com números concretos.',
    },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'titulo', 'descricao', 'ocorrencias', 'evidencias', 'texto_sugerido', 'campo_alvo'],
        properties: {
          tipo: {
            type: 'string',
            enum: ['INSTRUCAO', 'BASE_CONHECIMENTO', 'PERGUNTA', 'CAMPO', 'TRANSFERENCIA', 'OBJECAO'],
          },
          titulo: { type: 'string' },
          descricao: {
            type: 'string',
            description: 'O que foi observado e por que importa. Sem generalidade.',
          },
          ocorrencias: {
            type: 'integer',
            description: 'Quantas conversas do período sustentam este achado.',
          },
          evidencias: {
            type: 'array',
            description: 'Trechos curtos e reais das conversas analisadas.',
            items: { type: 'string' },
          },
          texto_sugerido: {
            type: ['string', 'null'],
            description: 'Texto pronto para entrar na configuração, quando aplicável.',
          },
          campo_alvo: {
            type: ['string', 'null'],
            description:
              'Campo da configuração que o texto sugerido altera: base_conhecimento, regras, objetivos, limitacoes ou persona.',
          },
        },
      },
    },
  },
};
