/**
 * O turno da IA numa conversa.
 *
 * Ordem das coisas, e o porquê de cada uma:
 *
 * 1. Relê a conversa do banco. O trabalho pode ter esperado na fila
 *    enquanto um atendente assumia — decidir com dado velho é justamente
 *    como IA e humano acabam respondendo juntos.
 * 2. Monta o contexto e chama o provedor.
 * 3. Grava o que a IA aprendeu (campos, memória, resumo) SEMPRE, mesmo
 *    quando transfere: o atendente recebe a conversa com o que já foi
 *    apurado.
 * 4. Grava a resposta pela função `registrar_mensagem_ia`, que confere o
 *    estado de novo dentro da transação. Se um humano assumiu nesse
 *    intervalo, a função devolve null e nada é enviado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgenteIa,
  BancoDados,
  Conversa,
  Json,
  VersaoAgenteIa,
} from '@/lib/tipos-banco';
import { obterProvedorIa } from '@/lib/provedores/ia/indice';
import { ErroProvedorIa } from '@/lib/provedores/ia/contrato';
import { montarContexto, type ContextoConversa } from './contexto';
import { montarMensagemUsuario, montarPromptSistema } from './prompt';
import { esquemaDecisaoIa, esquemaDecisaoJson, type DecisaoIa } from './esquemas';
import { chaveRespostaIa } from '@/lib/nucleo/idempotencia';
import { enfileirar, FILAS } from '@/lib/filas/produtor';
import { log } from '@/lib/log';

type Cliente = SupabaseClient<BancoDados>;

/** Abaixo disso, a conversa vai para uma pessoa em vez de arriscar. */
export const CONFIANCA_MINIMA = 0.45;

export type ResultadoTurnoIa =
  | { situacao: 'RESPONDEU'; mensagemId: string; decisao: DecisaoIa }
  | { situacao: 'TRANSFERIU'; mensagemId: string | null; decisao: DecisaoIa }
  | { situacao: 'IGNORADO'; motivo: string };

export async function executarTurnoIa(
  cliente: Cliente,
  conversaId: string,
  organizacaoId: string,
  mensagemGatilhoId: string,
): Promise<ResultadoTurnoIa> {
  const registro = log.comContexto({ organizacao_id: organizacaoId, conversa_id: conversaId });

  // 1. Estado fresco.
  const { data: conversa, error } = await cliente
    .from('conversas')
    .select('*')
    .eq('id', conversaId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler a conversa: ${error.message}`);
  if (!conversa) return { situacao: 'IGNORADO', motivo: 'Conversa não encontrada' };

  if (conversa.estado !== 'IA') {
    registro.info('Turno da IA descartado: a conversa não está com a IA', {
      estado: conversa.estado,
    });
    return { situacao: 'IGNORADO', motivo: `Conversa está em ${conversa.estado}` };
  }

  const { data: canal } = await cliente
    .from('canais')
    .select('ia_ativa, ativo')
    .eq('id', conversa.canal_id)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!canal?.ia_ativa) {
    return { situacao: 'IGNORADO', motivo: 'IA desligada neste canal' };
  }

  const agente = await carregarAgentePadrao(cliente, organizacaoId);
  if (!agente) {
    return { situacao: 'IGNORADO', motivo: 'Nenhum agente de IA configurado' };
  }

  const versao = await carregarVersaoPublicada(cliente, agente);
  if (!versao) {
    registro.warn('Agente sem versão publicada; conversa vai para atendimento humano', {
      agente_id: agente.id,
    });
    await encaminharParaHumano(cliente, conversa, null, 'Agente de IA sem versão publicada');
    return { situacao: 'TRANSFERIU', mensagemId: null, decisao: decisaoVazia() };
  }

  const contexto = await montarContexto(cliente, conversa);

  const seguidas = contarMensagensSeguidasDaIa(contexto);
  if (seguidas >= agente.max_mensagens_seguidas) {
    registro.warn('Limite de mensagens seguidas da IA atingido; encaminhando para humano', {
      seguidas,
    });
    await encaminharParaHumano(
      cliente,
      conversa,
      null,
      'A IA já enviou várias mensagens sem resposta do cliente',
    );
    return { situacao: 'TRANSFERIU', mensagemId: null, decisao: decisaoVazia() };
  }

  // 2. Chamada ao provedor.
  const provedor = obterProvedorIa();
  const inicio = Date.now();
  let decisao: DecisaoIa;
  let tokensEntrada: number | null = null;
  let tokensSaida: number | null = null;
  let modeloUsado = agente.modelo;

  try {
    const resposta = await provedor.gerarJson({
      modelo: agente.modelo,
      temperatura: Number(agente.temperatura),
      nomeEsquema: 'decisao_atendimento',
      esquema: esquemaDecisaoJson,
      mensagens: [
        { papel: 'sistema', conteudo: montarPromptSistema({ versao, contexto }) },
        { papel: 'usuario', conteudo: montarMensagemUsuario(contexto) },
      ],
    });

    tokensEntrada = resposta.uso.tokensEntrada;
    tokensSaida = resposta.uso.tokensSaida;
    modeloUsado = resposta.uso.modelo;

    const conferida = esquemaDecisaoIa.safeParse(resposta.conteudo);
    if (!conferida.success) {
      throw new ErroProvedorIa(
        `A IA devolveu um objeto fora do formato: ${conferida.error.issues
          .map((item) => item.path.join('.'))
          .join(', ')}`,
        { provedor: provedor.nome, permanente: false },
      );
    }

    decisao = conferida.data;
  } catch (erro) {
    await registrarInteracao(cliente, {
      organizacaoId,
      conversaId,
      agenteId: agente.id,
      versaoId: versao.id,
      provedor: provedor.nome,
      modelo: modeloUsado,
      latenciaMs: Date.now() - inicio,
      sucesso: false,
      erro: erro instanceof Error ? erro.message : String(erro),
      tokensEntrada,
      tokensSaida,
    });

    // Erro permanente (chave errada, prompt inválido) não melhora com
    // repetição: a conversa vai para uma pessoa agora.
    if (erro instanceof ErroProvedorIa && erro.permanente) {
      registro.error('IA indisponível de forma permanente; encaminhando para humano', {
        erro: erro.message,
      });
      await encaminharParaHumano(cliente, conversa, null, 'IA indisponível');
      return { situacao: 'TRANSFERIU', mensagemId: null, decisao: decisaoVazia() };
    }

    throw erro;
  }

  await registrarInteracao(cliente, {
    organizacaoId,
    conversaId,
    agenteId: agente.id,
    versaoId: versao.id,
    provedor: provedor.nome,
    modelo: modeloUsado,
    latenciaMs: Date.now() - inicio,
    sucesso: true,
    erro: null,
    tokensEntrada,
    tokensSaida,
  });

  // 3. Aprendizado gravado antes de qualquer decisão de roteamento.
  await aplicarAprendizado(cliente, contexto, decisao, mensagemGatilhoId);

  const precisaHumano = decisao.precisa_humano || decisao.confianca < CONFIANCA_MINIMA;
  const texto = (decisao.resposta ?? '').trim();

  // 4. Resposta gravada sob a trava do banco.
  let mensagemId: string | null = null;

  if (texto) {
    const { data, error: erroRpc } = await cliente.rpc('registrar_mensagem_ia', {
      p_conversa_id: conversaId,
      p_conteudo: texto,
      p_chave_idempotencia: chaveRespostaIa(conversaId, mensagemGatilhoId),
      p_metadados: {
        agente_id: agente.id,
        versao_id: versao.id,
        confianca: decisao.confianca,
      } as unknown as Json,
    });

    if (erroRpc) throw new Error(`Falha ao registrar resposta da IA: ${erroRpc.message}`);

    mensagemId = data ?? null;

    if (!mensagemId) {
      registro.info('Resposta da IA descartada: a conversa saiu do estado IA durante o processamento');
      return { situacao: 'IGNORADO', motivo: 'Um humano assumiu durante o processamento' };
    }

    await enfileirar(
      FILAS.mensagensEnviadas,
      { mensagemId, organizacaoId },
      { id: `envio:${mensagemId}` },
    );
  }

  if (precisaHumano) {
    await encaminharParaHumano(
      cliente,
      conversa,
      decisao.departamento_sugerido,
      decisao.motivo_humano ??
        (decisao.confianca < CONFIANCA_MINIMA
          ? `Confiança baixa (${decisao.confianca.toFixed(2)})`
          : 'A IA pediu atendimento humano'),
    );

    return { situacao: 'TRANSFERIU', mensagemId, decisao };
  }

  if (!mensagemId) {
    // Sem texto e sem transferência não é uma decisão válida: melhor
    // chamar uma pessoa do que deixar o cliente sem resposta.
    await encaminharParaHumano(cliente, conversa, null, 'A IA não produziu resposta');
    return { situacao: 'TRANSFERIU', mensagemId: null, decisao };
  }

  return { situacao: 'RESPONDEU', mensagemId, decisao };
}

// ---------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------

function decisaoVazia(): DecisaoIa {
  return {
    resposta: null,
    precisa_humano: true,
    motivo_humano: null,
    departamento_sugerido: null,
    dados_coletados: [],
    memorias: [],
    resumo_atualizado: null,
    confianca: 0,
  };
}

async function carregarAgentePadrao(
  cliente: Cliente,
  organizacaoId: string,
): Promise<AgenteIa | null> {
  const { data } = await cliente
    .from('agentes_ia')
    .select('*')
    .eq('organizacao_id', organizacaoId)
    .eq('ativo', true)
    .eq('padrao', true)
    .maybeSingle();

  return data ?? null;
}

async function carregarVersaoPublicada(
  cliente: Cliente,
  agente: AgenteIa,
): Promise<VersaoAgenteIa | null> {
  if (!agente.versao_publicada_id) return null;

  const { data } = await cliente
    .from('versoes_agente_ia')
    .select('*')
    .eq('id', agente.versao_publicada_id)
    .eq('status', 'PUBLICADA')
    .maybeSingle();

  return data ?? null;
}

/** Mensagens da IA desde a última fala do cliente. */
function contarMensagensSeguidasDaIa(contexto: ContextoConversa): number {
  let total = 0;
  for (let i = contexto.mensagensRecentes.length - 1; i >= 0; i -= 1) {
    const mensagem = contexto.mensagensRecentes[i];
    if (!mensagem) break;
    if (mensagem.autor === 'CONTATO') break;
    if (mensagem.autor === 'IA') total += 1;
  }
  return total;
}

/**
 * Grava campos, memórias e resumo.
 *
 * Campo com chave desconhecida é descartado em silêncio de propósito: a
 * IA não cria coluna nova por conta própria, e um nome inventado não pode
 * virar dado do cliente.
 */
async function aplicarAprendizado(
  cliente: Cliente,
  contexto: ContextoConversa,
  decisao: DecisaoIa,
  mensagemGatilhoId: string,
): Promise<void> {
  const organizacaoId = contexto.conversa.organizacao_id;
  const contatoId = contexto.contato.id;

  const porChave = new Map(contexto.campos.map((item) => [item.campo.chave, item.campo]));

  const valores = decisao.dados_coletados
    .map((item) => {
      const campo = porChave.get(item.campo);
      if (!campo) return null;
      const valor = item.valor.trim();
      if (!valor) return null;
      return {
        organizacao_id: organizacaoId,
        contato_id: contatoId,
        campo_id: campo.id,
        valor,
        origem: 'IA' as const,
        atualizado_em: new Date().toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (valores.length) {
    const { error } = await cliente
      .from('valores_campos_contato')
      .upsert(valores, { onConflict: 'contato_id,campo_id' });

    if (error) {
      log.error('Falha ao gravar dados coletados pela IA', {
        organizacao_id: organizacaoId,
        contato_id: contatoId,
        erro: error.message,
      });
    }
  }

  if (decisao.memorias.length) {
    const memorias = decisao.memorias
      .filter((memoria) => memoria.chave.trim() && memoria.conteudo.trim())
      .slice(0, 10)
      .map((memoria) => ({
        organizacao_id: organizacaoId,
        contato_id: contatoId,
        tipo: memoria.tipo,
        chave: memoria.chave.trim().toLowerCase().slice(0, 60),
        conteudo: memoria.conteudo.trim().slice(0, 500),
        origem: 'IA' as const,
        mensagem_id: mensagemGatilhoId,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      }));

    if (memorias.length) {
      const { error } = await cliente
        .from('memorias_contato')
        .upsert(memorias, { onConflict: 'contato_id,chave' });

      if (error) {
        log.error('Falha ao gravar memória do contato', {
          organizacao_id: organizacaoId,
          contato_id: contatoId,
          erro: error.message,
        });
      }
    }
  }

  const resumo = decisao.resumo_atualizado?.trim();
  if (resumo && resumo !== contexto.contato.resumo) {
    await cliente
      .from('contatos')
      .update({ resumo, resumo_atualizado_em: new Date().toISOString() })
      .eq('id', contatoId)
      .eq('organizacao_id', organizacaoId);
  }
}

async function encaminharParaHumano(
  cliente: Cliente,
  conversa: Conversa,
  chaveDepartamento: string | null,
  motivo: string,
): Promise<void> {
  let departamentoId: string | null = null;

  if (chaveDepartamento) {
    const { data } = await cliente
      .from('departamentos')
      .select('id')
      .eq('organizacao_id', conversa.organizacao_id)
      .eq('chave', chaveDepartamento)
      .eq('ativo', true)
      .maybeSingle();

    departamentoId = data?.id ?? null;
  }

  const { error } = await cliente.rpc('transferir_conversa', {
    p_conversa_id: conversa.id,
    p_departamento_id: departamentoId,
    p_membro_id: null,
    p_ator_membro_id: null,
    p_ator: 'IA',
    p_motivo: motivo,
  });

  if (error) {
    throw new Error(`Falha ao encaminhar a conversa para atendimento humano: ${error.message}`);
  }
}

interface DadosInteracao {
  organizacaoId: string;
  conversaId: string;
  agenteId: string;
  versaoId: string;
  provedor: string;
  modelo: string;
  latenciaMs: number;
  sucesso: boolean;
  erro: string | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

async function registrarInteracao(cliente: Cliente, dados: DadosInteracao): Promise<void> {
  const { error } = await cliente.from('interacoes_ia').insert({
    organizacao_id: dados.organizacaoId,
    conversa_id: dados.conversaId,
    agente_id: dados.agenteId,
    versao_id: dados.versaoId,
    finalidade: 'RESPOSTA',
    provedor: dados.provedor,
    modelo: dados.modelo,
    tokens_entrada: dados.tokensEntrada,
    tokens_saida: dados.tokensSaida,
    latencia_ms: dados.latenciaMs,
    sucesso: dados.sucesso,
    erro: dados.erro,
  });

  if (error) {
    log.error('Falha ao registrar interação da IA', {
      organizacao_id: dados.organizacaoId,
      conversa_id: dados.conversaId,
      erro: error.message,
    });
  }
}
