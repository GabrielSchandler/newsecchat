/**
 * Análise de atendimentos.
 *
 * Lê as conversas do período e produz achados com evidência: pergunta que
 * se repete sem resposta boa, ponto de abandono, objeção recorrente,
 * transferência que poderia ter sido evitada.
 *
 * O resultado NUNCA é aplicado sozinho. Cada achado vira uma sugestão em
 * `sugestoes_ia` com status PENDENTE, e só vira versão nova de prompt
 * depois de um humano aprovar — regra que está no banco, na interface e
 * aqui.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { obterProvedorIa } from '@/lib/provedores/ia/indice';
import { montarPromptAnalise } from '@/lib/ia/prompt';
import { esquemaAnaliseIa, esquemaAnaliseJson } from '@/lib/ia/esquemas';
import { ambienteServidor, integracaoConfigurada } from '@/lib/ambiente';
import type { TrabalhoAnaliseIa } from '@/lib/filas/nomes';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

/** Teto de conversas por análise: mantém custo e tempo previsíveis. */
const MAXIMO_CONVERSAS = 120;
const MAXIMO_MENSAGENS_POR_CONVERSA = 30;

export async function processarAnaliseIa(trabalho: TrabalhoAnaliseIa): Promise<void> {
  const supabase = clienteAdministrador();
  const registro = log.comContexto({
    organizacao_id: trabalho.organizacaoId,
    execucao: trabalho.execucaoId,
  });

  const { data: execucao, error } = await supabase
    .from('execucoes_analise_ia')
    .select('*')
    .eq('id', trabalho.execucaoId)
    .eq('organizacao_id', trabalho.organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler a execução: ${error.message}`);
  if (!execucao) return;

  if (execucao.status === 'CONCLUIDA') {
    registro.info('Análise já concluída; nada a refazer');
    return;
  }

  if (!integracaoConfigurada('IA')) {
    await falhar(trabalho, 'Provedor de IA não configurado. Preencha OPENAI_API_KEY.');
    return;
  }

  await supabase
    .from('execucoes_analise_ia')
    .update({ status: 'EXECUTANDO' })
    .eq('id', execucao.id);

  try {
    const { data: organizacao } = await supabase
      .from('organizacoes')
      .select('nome')
      .eq('id', trabalho.organizacaoId)
      .maybeSingle();

    const { data: conversas } = await supabase
      .from('conversas')
      .select('id, estado, iniciada_em, encerrada_em, departamento_id, motivo_encerramento')
      .eq('organizacao_id', trabalho.organizacaoId)
      .gte('iniciada_em', execucao.periodo_inicio)
      .lte('iniciada_em', execucao.periodo_fim)
      .order('iniciada_em', { ascending: false })
      .limit(MAXIMO_CONVERSAS);

    if (!conversas || conversas.length === 0) {
      await supabase
        .from('execucoes_analise_ia')
        .update({
          status: 'CONCLUIDA',
          concluido_em: new Date().toISOString(),
          total_conversas: 0,
          total_mensagens: 0,
          resumo: 'Nenhuma conversa no período selecionado.',
          relatorio: { achados: [] } as unknown as Json,
        })
        .eq('id', execucao.id);

      registro.info('Análise concluída sem conversas no período');
      return;
    }

    const transcricoes: string[] = [];
    let totalMensagens = 0;

    for (const conversa of conversas) {
      const { data: mensagens } = await supabase
        .from('mensagens')
        .select('autor, conteudo, criado_em, tipo')
        .eq('organizacao_id', trabalho.organizacaoId)
        .eq('conversa_id', conversa.id)
        .order('criado_em', { ascending: true })
        .limit(MAXIMO_MENSAGENS_POR_CONVERSA);

      if (!mensagens?.length) continue;
      totalMensagens += mensagens.length;

      const dialogo = mensagens
        .map((mensagem) => {
          const quem =
            mensagem.autor === 'CONTATO'
              ? 'Cliente'
              : mensagem.autor === 'IA'
                ? 'IA'
                : mensagem.autor === 'ATENDENTE'
                  ? 'Atendente'
                  : 'Sistema';
          return `${quem}: ${mensagem.conteudo?.slice(0, 400) ?? `(${mensagem.tipo.toLowerCase()})`}`;
        })
        .join('\n');

      transcricoes.push(
        `--- Conversa ${conversa.id.slice(0, 8)} | estado final: ${conversa.estado}${
          conversa.motivo_encerramento ? ` | encerramento: ${conversa.motivo_encerramento}` : ''
        }\n${dialogo}`,
      );
    }

    const provedor = obterProvedorIa();
    const resposta = await provedor.gerarJson({
      modelo: ambienteServidor.openaiModeloAnalise,
      temperatura: 0.2,
      maxTokens: 4000,
      nomeEsquema: 'analise_atendimentos',
      esquema: esquemaAnaliseJson,
      mensagens: [
        { papel: 'sistema', conteudo: montarPromptAnalise(organizacao?.nome ?? 'a empresa') },
        {
          papel: 'usuario',
          conteudo: [
            `Período: ${execucao.periodo_inicio} a ${execucao.periodo_fim}`,
            `Conversas analisadas: ${conversas.length}`,
            '',
            transcricoes.join('\n\n'),
          ].join('\n'),
        },
      ],
    });

    const conferida = esquemaAnaliseIa.safeParse(resposta.conteudo);
    if (!conferida.success) {
      throw new Error('A IA devolveu a análise fora do formato esperado.');
    }

    const analise = conferida.data;

    await supabase
      .from('execucoes_analise_ia')
      .update({
        status: 'CONCLUIDA',
        concluido_em: new Date().toISOString(),
        total_conversas: conversas.length,
        total_mensagens: totalMensagens,
        resumo: analise.resumo,
        relatorio: analise as unknown as Json,
      })
      .eq('id', execucao.id);

    if (analise.achados.length) {
      const { data: agente } = await supabase
        .from('agentes_ia')
        .select('id')
        .eq('organizacao_id', trabalho.organizacaoId)
        .eq('padrao', true)
        .maybeSingle();

      await supabase.from('sugestoes_ia').insert(
        analise.achados.map((achado) => ({
          organizacao_id: trabalho.organizacaoId,
          execucao_id: execucao.id,
          agente_id: agente?.id ?? null,
          tipo: achado.tipo,
          titulo: achado.titulo.slice(0, 200),
          descricao: achado.descricao,
          evidencias: achado.evidencias as unknown as Json,
          ocorrencias: achado.ocorrencias,
          alteracao_proposta: {
            campo: achado.campo_alvo,
            texto: achado.texto_sugerido,
          } as unknown as Json,
          status: 'PENDENTE' as const,
        })),
      );
    }

    await supabase.from('interacoes_ia').insert({
      organizacao_id: trabalho.organizacaoId,
      finalidade: 'ANALISE',
      provedor: provedor.nome,
      modelo: resposta.uso.modelo,
      tokens_entrada: resposta.uso.tokensEntrada,
      tokens_saida: resposta.uso.tokensSaida,
      latencia_ms: resposta.uso.latenciaMs,
      sucesso: true,
    });

    registro.info('Análise concluída', {
      conversas: conversas.length,
      achados: analise.achados.length,
    });
  } catch (erro) {
    const descricao = erro instanceof Error ? erro.message : String(erro);
    await falhar(trabalho, descricao);
    throw erro;
  }
}

async function falhar(trabalho: TrabalhoAnaliseIa, motivo: string): Promise<void> {
  await clienteAdministrador()
    .from('execucoes_analise_ia')
    .update({ status: 'FALHOU', erro: motivo, concluido_em: new Date().toISOString() })
    .eq('id', trabalho.execucaoId)
    .eq('organizacao_id', trabalho.organizacaoId);
}
