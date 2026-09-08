'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirPapel } from '@/lib/sessao';
import { enfileirar, FILAS, modoFila } from '@/lib/filas/produtor';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { normalizarTelefone, variantesBrasil } from '@/lib/nucleo/telefone';
import { aplicarModelo, variaveisDoModelo } from '@/lib/nucleo/modelos';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

export interface Resultado {
  ok: boolean;
  erro?: string;
  aviso?: string;
  campanhaId?: string;
  adicionados?: number;
  ignorados?: number;
}

const uuid = z.string().uuid();

const esquemaCampanha = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à campanha').max(120),
  descricao: z.string().trim().max(500).nullable(),
  canalId: uuid,
  departamentoId: uuid.nullable(),
  mensagem: z.string().trim().min(10, 'A mensagem está curta demais').max(2000),
  variacoes: z.array(z.string().trim().min(10).max(2000)).max(5),
  intervaloMinimo: z.number().int().min(5).max(3600),
  intervaloMaximo: z.number().int().min(5).max(7200),
  janelaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido'),
  janelaFim: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido'),
  diasSemana: z.array(z.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia'),
  limiteDiario: z.number().int().min(1).max(5000),
  iaAssumeResposta: z.boolean(),
});

export async function criarCampanha(entrada: z.infer<typeof esquemaCampanha>): Promise<Resultado> {
  const conferido = esquemaCampanha.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  if (conferido.data.intervaloMaximo < conferido.data.intervaloMinimo) {
    return { ok: false, erro: 'O intervalo máximo precisa ser maior ou igual ao mínimo.' };
  }

  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  // Variável inexistente na mensagem só apareceria como falha na hora do
  // envio, contato por contato. Melhor recusar agora.
  const { data: campos } = await supabase
    .from('campos_personalizados')
    .select('chave')
    .eq('organizacao_id', sessao.organizacao.id)
    .eq('ativo', true);

  const conhecidas = new Set([
    'nome',
    'primeiro_nome',
    'telefone',
    ...(campos ?? []).map((campo) => campo.chave),
  ]);

  const desconhecidas = [conferido.data.mensagem, ...conferido.data.variacoes]
    .flatMap((texto) => variaveisDoModelo(texto))
    .filter((variavel) => !conhecidas.has(variavel));

  if (desconhecidas.length) {
    return {
      ok: false,
      erro: `A mensagem usa variável que não existe: ${[...new Set(desconhecidas)].join(', ')}. Disponíveis: ${[...conhecidas].join(', ')}.`,
    };
  }

  const { data: canal } = await supabase
    .from('canais')
    .select('id, ativo')
    .eq('id', conferido.data.canalId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!canal) return { ok: false, erro: 'Canal não encontrado.' };

  const { data: campanha, error } = await supabase
    .from('campanhas')
    .insert({
      organizacao_id: sessao.organizacao.id,
      nome: conferido.data.nome,
      descricao: conferido.data.descricao,
      canal_id: conferido.data.canalId,
      departamento_id: conferido.data.departamentoId,
      mensagem: conferido.data.mensagem,
      variacoes: conferido.data.variacoes as unknown as Json,
      intervalo_minimo_segundos: conferido.data.intervaloMinimo,
      intervalo_maximo_segundos: conferido.data.intervaloMaximo,
      janela_inicio: conferido.data.janelaInicio,
      janela_fim: conferido.data.janelaFim,
      dias_semana: conferido.data.diasSemana,
      limite_diario: conferido.data.limiteDiario,
      ia_assume_resposta: conferido.data.iaAssumeResposta,
      status: 'RASCUNHO',
      criado_por: sessao.membro.id,
    })
    .select('id')
    .single();

  if (error) {
    log.error('Falha ao criar campanha', { erro: error.message });
    return { ok: false, erro: 'Não foi possível criar a campanha.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CAMPANHA_CRIADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'campanhas',
    entidadeId: campanha.id,
    metadados: { nome: conferido.data.nome },
  });

  revalidatePath('/campanhas');
  return { ok: true, campanhaId: campanha.id };
}

/**
 * Adiciona destinatários.
 *
 * Contato sem aceite de campanha e contato bloqueado nem entram na lista.
 * O envio confere de novo depois — quem sai da lista entre a montagem e o
 * disparo também precisa ser respeitado.
 */
export async function adicionarDestinatarios(entrada: {
  campanhaId: string;
  origem: 'ETIQUETA' | 'TELEFONES' | 'TODOS';
  etiquetaId?: string | null;
  telefones?: string;
}): Promise<Resultado> {
  const conferido = z
    .object({
      campanhaId: uuid,
      origem: z.enum(['ETIQUETA', 'TELEFONES', 'TODOS']),
      etiquetaId: uuid.nullable().optional(),
      telefones: z.string().max(50000).optional(),
    })
    .safeParse(entrada);

  if (!conferido.success) return { ok: false, erro: 'Dados inválidos' };

  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: campanha } = await supabase
    .from('campanhas')
    .select('id, status')
    .eq('id', conferido.data.campanhaId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!campanha) return { ok: false, erro: 'Campanha não encontrada.' };

  if (campanha.status === 'CONCLUIDA' || campanha.status === 'CANCELADA') {
    return { ok: false, erro: 'Esta campanha já terminou. Crie uma nova.' };
  }

  let idsContatos: string[] = [];
  let ignoradosPorTelefone = 0;

  if (conferido.data.origem === 'TELEFONES') {
    const linhas = (conferido.data.telefones ?? '')
      .split(/[\n,;]/)
      .map((linha) => linha.trim())
      .filter(Boolean);

    if (linhas.length === 0) return { ok: false, erro: 'Cole ao menos um telefone.' };
    if (linhas.length > 2000) {
      return { ok: false, erro: 'Máximo de 2000 telefones por vez. Divida a lista.' };
    }

    const normalizados = new Set<string>();
    for (const linha of linhas) {
      const telefone = normalizarTelefone(linha);
      if (telefone) normalizados.add(telefone);
      else ignoradosPorTelefone += 1;
    }

    const todasVariantes = [...normalizados].flatMap((telefone) => variantesBrasil(telefone));

    const { data: existentes } = await supabase
      .from('contatos')
      .select('id, telefone')
      .eq('organizacao_id', sessao.organizacao.id)
      .in('telefone', todasVariantes);

    const encontrados = new Set((existentes ?? []).map((contato) => contato.telefone));
    idsContatos = (existentes ?? []).map((contato) => contato.id);

    // Telefone que ainda não é contato vira contato agora — é o caso do
    // repique a partir de uma lista antiga.
    const novos = [...normalizados].filter(
      (telefone) => !variantesBrasil(telefone).some((variante) => encontrados.has(variante)),
    );

    if (novos.length) {
      const { data: criados, error } = await supabase
        .from('contatos')
        .insert(
          novos.map((telefone) => ({
            organizacao_id: sessao.organizacao.id,
            telefone,
            origem: 'CAMPANHA',
          })),
        )
        .select('id');

      if (error) {
        log.error('Falha ao criar contatos da campanha', { erro: error.message });
      } else {
        idsContatos.push(...(criados ?? []).map((contato) => contato.id));
      }
    }
  } else if (conferido.data.origem === 'ETIQUETA') {
    if (!conferido.data.etiquetaId) return { ok: false, erro: 'Escolha uma etiqueta.' };

    const { data } = await supabase
      .from('etiquetas_contato')
      .select('contato_id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('etiqueta_id', conferido.data.etiquetaId)
      .limit(5000);

    idsContatos = (data ?? []).map((linha) => linha.contato_id);
  } else {
    const { data } = await supabase
      .from('contatos')
      .select('id')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('aceita_campanha', true)
      .eq('bloqueado', false)
      .limit(5000);

    idsContatos = (data ?? []).map((contato) => contato.id);
  }

  if (idsContatos.length === 0) {
    return { ok: false, erro: 'Nenhum contato encontrado para adicionar.' };
  }

  // Filtra opt-out e bloqueio na origem.
  const { data: elegiveis } = await supabase
    .from('contatos')
    .select('id')
    .eq('organizacao_id', sessao.organizacao.id)
    .in('id', idsContatos)
    .eq('aceita_campanha', true)
    .eq('bloqueado', false);

  const idsElegiveis = (elegiveis ?? []).map((contato) => contato.id);
  const removidosPorOptOut = idsContatos.length - idsElegiveis.length;

  if (idsElegiveis.length === 0) {
    return {
      ok: false,
      erro: 'Todos os contatos encontrados estão bloqueados ou pediram para não receber campanhas.',
    };
  }

  const { error: erroInsercao } = await supabase.from('contatos_campanha').upsert(
    idsElegiveis.map((contatoId) => ({
      organizacao_id: sessao.organizacao.id,
      campanha_id: conferido.data.campanhaId,
      contato_id: contatoId,
      status: 'PENDENTE' as const,
    })),
    { onConflict: 'campanha_id,contato_id', ignoreDuplicates: true },
  );

  if (erroInsercao) {
    return { ok: false, erro: 'Não foi possível adicionar os contatos.' };
  }

  const { count } = await supabase
    .from('contatos_campanha')
    .select('id', { count: 'exact', head: true })
    .eq('campanha_id', conferido.data.campanhaId);

  await supabase
    .from('campanhas')
    .update({ total: count ?? 0 })
    .eq('id', conferido.data.campanhaId)
    .eq('organizacao_id', sessao.organizacao.id);

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CAMPANHA_CONTATOS_ADICIONADOS,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'campanhas',
    entidadeId: conferido.data.campanhaId,
    metadados: { adicionados: idsElegiveis.length, origem: conferido.data.origem },
  });

  revalidatePath(`/campanhas/${conferido.data.campanhaId}`);

  const partes: string[] = [];
  if (removidosPorOptOut > 0) {
    partes.push(`${removidosPorOptOut} fora por opt-out ou bloqueio`);
  }
  if (ignoradosPorTelefone > 0) {
    partes.push(`${ignoradosPorTelefone} telefone(s) em formato inválido`);
  }

  return {
    ok: true,
    adicionados: idsElegiveis.length,
    ignorados: removidosPorOptOut + ignoradosPorTelefone,
    aviso: partes.length ? partes.join('; ') + '.' : undefined,
  };
}

export async function mudarSituacaoCampanha(
  campanhaId: string,
  acao: 'INICIAR' | 'PAUSAR' | 'RETOMAR' | 'CANCELAR',
): Promise<Resultado> {
  if (!uuid.safeParse(campanhaId).success) return { ok: false, erro: 'Campanha inválida' };

  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: campanha } = await supabase
    .from('campanhas')
    .select('*')
    .eq('id', campanhaId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!campanha) return { ok: false, erro: 'Campanha não encontrada.' };

  if (acao === 'INICIAR' || acao === 'RETOMAR') {
    if (modoFila() === 'INDISPONIVEL') {
      return {
        ok: false,
        erro: 'A campanha precisa da fila para rodar. Configure REDIS_URL — ver OWNER_SETUP_GUIDE.md, seção REDIS.',
      };
    }

    const { data: canal } = await supabase
      .from('canais')
      .select('status, ativo, nome')
      .eq('id', campanha.canal_id)
      .maybeSingle();

    if (!canal?.ativo || canal.status !== 'CONECTADO') {
      return {
        ok: false,
        erro: `O canal “${canal?.nome ?? 'escolhido'}” não está conectado. Conecte antes de iniciar.`,
      };
    }

    const { count } = await supabase
      .from('contatos_campanha')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanhaId)
      .eq('status', 'PENDENTE');

    if ((count ?? 0) === 0) {
      return { ok: false, erro: 'Não há destinatários pendentes nesta campanha.' };
    }
  }

  const novoStatus =
    acao === 'INICIAR' || acao === 'RETOMAR'
      ? 'EM_EXECUCAO'
      : acao === 'PAUSAR'
        ? 'PAUSADA'
        : 'CANCELADA';

  const { error } = await supabase
    .from('campanhas')
    .update({
      status: novoStatus,
      iniciada_em: acao === 'INICIAR' ? new Date().toISOString() : campanha.iniciada_em,
      concluida_em: acao === 'CANCELAR' ? new Date().toISOString() : campanha.concluida_em,
    })
    .eq('id', campanhaId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível alterar a campanha.' };

  if (novoStatus === 'EM_EXECUCAO') {
    try {
      await enfileirar(
        FILAS.campanhas,
        { campanhaId, organizacaoId: sessao.organizacao.id },
        { id: `campanha:${campanhaId}:${Date.now()}` },
      );
    } catch (erro) {
      await supabase.from('campanhas').update({ status: 'PAUSADA' }).eq('id', campanhaId);
      return {
        ok: false,
        erro: `Não foi possível enfileirar a campanha: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      };
    }
  }

  const acoes = {
    INICIAR: ACOES.CAMPANHA_INICIADA,
    PAUSAR: ACOES.CAMPANHA_PAUSADA,
    RETOMAR: ACOES.CAMPANHA_RETOMADA,
    CANCELAR: ACOES.CAMPANHA_CANCELADA,
  } as const;

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: acoes[acao],
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'campanhas',
    entidadeId: campanhaId,
    metadados: { nome: campanha.nome },
  });

  revalidatePath('/campanhas');
  revalidatePath(`/campanhas/${campanhaId}`);

  // Pausar não cancela o trabalho já agendado: o worker confere o status
  // antes de cada envio e para sozinho. Vale dizer isso ao usuário.
  if (acao === 'PAUSAR') {
    return { ok: true, aviso: 'Campanha pausada. O envio em andamento termina e nenhum novo começa.' };
  }

  return { ok: true };
}

/** Prévia da mensagem com os dados de um contato de verdade. */
export async function preverMensagem(entrada: {
  campanhaId?: string | null;
  mensagem: string;
  contatoId?: string | null;
}): Promise<{ ok: boolean; texto?: string; faltando?: string[]; erro?: string }> {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: contato } = entrada.contatoId
    ? await supabase
        .from('contatos')
        .select('*')
        .eq('id', entrada.contatoId)
        .eq('organizacao_id', sessao.organizacao.id)
        .maybeSingle()
    : await supabase
        .from('contatos')
        .select('*')
        .eq('organizacao_id', sessao.organizacao.id)
        .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

  if (!contato) {
    return {
      ok: false,
      erro: 'Ainda não há contatos na base para gerar a prévia com dados reais.',
    };
  }

  const { data: valores } = await supabase
    .from('valores_campos_contato')
    .select('valor, campo_id')
    .eq('organizacao_id', sessao.organizacao.id)
    .eq('contato_id', contato.id);

  const { data: campos } = await supabase
    .from('campos_personalizados')
    .select('id, chave')
    .eq('organizacao_id', sessao.organizacao.id);

  const porId = new Map((campos ?? []).map((campo) => [campo.id, campo.chave]));

  const dados: Record<string, string | null> = {
    nome: contato.nome ?? contato.nome_perfil_whatsapp,
    telefone: contato.telefone,
  };

  for (const valor of valores ?? []) {
    const chave = porId.get(valor.campo_id);
    if (chave) dados[chave] = valor.valor;
  }

  const resultado = aplicarModelo(entrada.mensagem, dados);
  return { ok: true, texto: resultado.texto, faltando: resultado.faltando };
}
