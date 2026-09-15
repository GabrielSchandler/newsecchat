/**
 * Montagem do prompt do agente.
 *
 * O prompt é construído a partir da versão PUBLICADA da configuração —
 * nunca de um rascunho e nunca de texto escrito aqui no código. É o que
 * garante que o que roda em produção seja exatamente o que alguém
 * aprovou, e é a razão de este arquivo não conter nenhuma regra de
 * negócio de nenhuma empresa específica.
 */
import type { VersaoAgenteIa } from '@/lib/tipos-banco';
import {
  descreverCamposFaltando,
  descreverContato,
  descreverDepartamentos,
  descreverHistorico,
  type ContextoConversa,
} from './contexto';
import { conferirHorarioAtendimento, type HorarioAtendimento } from '@/lib/nucleo/janela-envio';

function secao(titulo: string, corpo: string | null | undefined): string {
  const texto = (corpo ?? '').trim();
  if (!texto) return '';
  return `\n## ${titulo}\n${texto}\n`;
}

/**
 * Regras de comportamento que não vêm da configuração da empresa.
 *
 * Ficam no código porque são propriedades do produto, não preferência de
 * cliente: não inventar, não repetir pergunta, não prometer, não se passar
 * por humano quando perguntado diretamente. Um cliente pode ajustar o tom;
 * não pode desligar a honestidade do atendimento.
 */
const REGRAS_DO_PRODUTO = `
- Uma pergunta por mensagem. Conversa, não formulário.
- Nunca repita uma pergunta cuja resposta já esteja em "Dados já coletados" ou na memória.
- Se o cliente adiantar uma informação que você perguntaria depois, registre em dados_coletados e siga em frente.
- Sem informação suficiente, não invente: marque precisa_humano = true e explique o motivo.
- Não prometa resultado, prazo ou valor que não esteja escrito nesta configuração.
- Não fale de outros clientes, de processos internos, nem de nada fora desta configuração.
- Se uma mensagem antiga do histórico aparecer como "(áudio sem transcrição disponível)", "(imagem enviada)" ou algo parecido, foi uma falha técnica pontual daquele arquivo — não vire uma regra permanente sobre o que você consegue processar. Se a mensagem mais recente do cliente já veio com texto (transcrito ou descrito), responda a esse texto normalmente, mesmo que você tenha dito antes, nesta mesma conversa, que não conseguia.
- Se perguntarem diretamente se você é uma pessoa ou um sistema, responda com honestidade e ofereça um atendente.
- Escreva como se escreve no WhatsApp: mensagens curtas, sem markdown, sem lista numerada, sem títulos.
- Responda no idioma em que o cliente escreveu.
`.trim();

export interface EntradaPrompt {
  versao: VersaoAgenteIa;
  contexto: ContextoConversa;
  /** Instante usado para conferir horário de atendimento. */
  agora?: Date;
}

export function montarPromptSistema({ versao, contexto, agora = new Date() }: EntradaPrompt): string {
  const horario = conferirHorarioAtendimento(
    versao.horarios as unknown as HorarioAtendimento,
    agora,
  );

  const partes: string[] = [];

  partes.push(
    'Você é o atendimento de WhatsApp da empresa descrita abaixo. Sua saída é um objeto JSON no formato combinado — a chave "resposta" é o texto que o cliente vai ler.',
  );

  partes.push(secao('Quem você é', versao.persona));
  partes.push(secao('Tom de voz', versao.tom));
  partes.push(secao('A empresa', versao.descricao_empresa));
  partes.push(secao('Serviços', versao.servicos));
  partes.push(secao('Base de conhecimento', versao.base_conhecimento));
  partes.push(secao('Seus objetivos nesta conversa', versao.objetivos));
  partes.push(secao('Regras da empresa', versao.regras));
  partes.push(secao('Limitações', versao.limitacoes));
  partes.push(secao('Informações proibidas', versao.informacoes_proibidas));

  const perguntas = Array.isArray(versao.perguntas) ? (versao.perguntas as unknown[]) : [];
  if (perguntas.length) {
    partes.push(
      secao(
        'Perguntas a cobrir ao longo da conversa',
        perguntas.map((pergunta) => `- ${String(pergunta)}`).join('\n') +
          '\n(A ordem é sugestão. Encaixe naturalmente.)',
      ),
    );
  }

  partes.push(secao('Regras de conduta (não negociáveis)', REGRAS_DO_PRODUTO));
  partes.push(secao('Informações que ainda faltam coletar', descreverCamposFaltando(contexto)));
  partes.push(
    secao(
      'Departamentos para onde encaminhar',
      `${descreverDepartamentos(contexto)}\n\nUse a chave exata em departamento_sugerido. Se nenhum servir, deixe null.`,
    ),
  );

  const criterios = Array.isArray(versao.criterios_transferencia)
    ? (versao.criterios_transferencia as unknown[])
    : [];
  if (criterios.length) {
    partes.push(
      secao(
        'Quando passar para uma pessoa',
        criterios.map((criterio) => `- ${String(criterio)}`).join('\n'),
      ),
    );
  }

  if (!horario.dentro) {
    partes.push(
      secao(
        'Fora do horário de atendimento',
        `Agora está fora do horário de atendimento configurado. ${
          horario.mensagemForaDoHorario
            ? `Avise o cliente com esta orientação: "${horario.mensagemForaDoHorario}".`
            : 'Avise o cliente que o time responde no próximo horário comercial.'
        } Continue coletando informação, mas não prometa retorno imediato.`,
      ),
    );
  }

  partes.push(secao('Ficha do contato', descreverContato(contexto)));

  return partes.filter(Boolean).join('\n').trim();
}

export function montarMensagemUsuario(contexto: ContextoConversa): string {
  return [
    '## Conversa até aqui',
    descreverHistorico(contexto),
    '',
    'Responda à última mensagem do cliente no formato JSON combinado.',
  ].join('\n');
}

/**
 * Prompt da análise de atendimentos.
 *
 * Pede números e trechos reais de propósito: sugestão sem evidência é
 * palpite, e quem vai revisar precisa conseguir conferir.
 */
export function montarPromptAnalise(nomeEmpresa: string): string {
  return `
Você analisa atendimentos de WhatsApp da empresa "${nomeEmpresa}" e produz um relatório para quem cuida da configuração da IA.

Procure, nas conversas fornecidas:
- perguntas que se repetem e não têm resposta boa na base de conhecimento;
- respostas da IA que ficaram vagas, erradas ou fora do tom;
- pontos em que o cliente abandonou a conversa;
- objeções recorrentes (preço, prazo, desconfiança);
- transferências que poderiam ter sido evitadas, e transferências que demoraram demais;
- informação que a IA precisou e não tinha.

Regras:
- Todo achado precisa de número de ocorrências e de trechos reais como evidência.
- Não invente estatística. Se algo aconteceu duas vezes, escreva duas.
- Quando propuser texto novo para a configuração, escreva o texto pronto, no mesmo tom das conversas.
- Não proponha alteração que contrarie as limitações já configuradas.
- Escreva em português do Brasil.
`.trim();
}
