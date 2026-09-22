'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirSessao } from '@/lib/sessao';
import { enviarMensagem } from '@/lib/servicos/envio';
import { chaveEnvioManual } from '@/lib/nucleo/idempotencia';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { ErroConfiguracao } from '@/lib/ambiente';
import { log } from '@/lib/log';

export interface Resultado {
  ok: boolean;
  erro?: string;
  aviso?: string;
  /** Id da mensagem gravada, quando a ação envia uma: a tela troca o balão provisório pelo definitivo. */
  mensagemId?: string;
}

const uuid = z.string().uuid('Identificador inválido');

/**
 * Confere que a conversa existe e é visível para quem chamou.
 *
 * A leitura passa por RLS, então uma conversa de outra organização
 * simplesmente não aparece — o retorno é o mesmo "não encontrada" que
 * apareceria para um id inexistente, sem revelar que ela existe.
 */
async function carregarConversa(conversaId: string) {
  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { data: conversa } = await supabase
    .from('conversas')
    .select('*')
    .eq('id', conversaId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  return { sessao, supabase, conversa };
}

export async function assumirConversa(conversaId: string): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success) return { ok: false, erro: 'Conversa inválida' };

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  const { data: assumiu, error } = await supabase.rpc('assumir_conversa', {
    p_conversa_id: conversaId,
    p_membro_id: sessao.membro.id,
    p_motivo: null,
  });

  if (error) {
    log.error('Falha ao assumir conversa', { conversa_id: conversaId, erro: error.message });
    return { ok: false, erro: 'Não foi possível assumir a conversa.' };
  }

  if (!assumiu) {
    return {
      ok: false,
      erro: 'Outro atendente assumiu esta conversa antes. Atualize a lista para ver quem está com ela.',
    };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONVERSA_ASSUMIDA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'conversas',
    entidadeId: conversaId,
  });

  revalidatePath('/atendimento');
  return { ok: true };
}

export async function devolverParaIa(conversaId: string, motivo?: string): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success) return { ok: false, erro: 'Conversa inválida' };

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  // A IA só volta a atender se o canal permitir. Devolver para uma IA
  // desligada deixaria o cliente falando sozinho.
  const { data: canal } = await supabase
    .from('canais')
    .select('ia_ativa')
    .eq('id', conversa.canal_id)
    .maybeSingle();

  if (!canal?.ia_ativa) {
    return {
      ok: false,
      erro: 'A IA está desligada neste canal. Ligue em Configurações > Canais antes de devolver.',
    };
  }

  const { data: devolveu, error } = await supabase.rpc('devolver_conversa_para_ia', {
    p_conversa_id: conversaId,
    p_membro_id: sessao.membro.id,
    p_motivo: motivo?.trim() || null,
  });

  if (error || !devolveu) {
    return { ok: false, erro: 'Não foi possível devolver a conversa para a IA.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONVERSA_DEVOLVIDA_IA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'conversas',
    entidadeId: conversaId,
    metadados: { motivo: motivo ?? null },
  });

  revalidatePath('/atendimento');
  return { ok: true };
}

const esquemaTransferencia = z.object({
  conversaId: uuid,
  departamentoId: uuid.nullable(),
  membroId: uuid.nullable(),
  motivo: z.string().max(500).optional(),
  nota: z.string().max(2000).optional(),
});

export async function transferirConversa(entrada: {
  conversaId: string;
  departamentoId: string | null;
  membroId: string | null;
  motivo?: string;
  nota?: string;
}): Promise<Resultado> {
  const conferido = esquemaTransferencia.safeParse(entrada);
  if (!conferido.success) return { ok: false, erro: 'Dados de transferência inválidos' };

  if (!conferido.data.departamentoId && !conferido.data.membroId) {
    return { ok: false, erro: 'Escolha um departamento ou um atendente.' };
  }

  const { sessao, supabase, conversa } = await carregarConversa(conferido.data.conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  const { data: transferiu, error } = await supabase.rpc('transferir_com_nota', {
    p_conversa: conferido.data.conversaId,
    p_equipe: conferido.data.departamentoId,
    p_membro: conferido.data.membroId,
    p_ator: sessao.membro.id,
    p_motivo: conferido.data.motivo?.trim() || null,
    p_nota: conferido.data.nota?.trim() || null,
  });

  if (error || !transferiu) {
    return { ok: false, erro: 'Não foi possível transferir a conversa.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONVERSA_TRANSFERIDA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'conversas',
    entidadeId: conferido.data.conversaId,
    metadados: {
      departamento_id: conferido.data.departamentoId,
      membro_id: conferido.data.membroId,
      motivo: conferido.data.motivo ?? null,
    },
  });

  revalidatePath('/atendimento');
  return { ok: true };
}

export async function encerrarConversa(conversaId: string, motivo?: string, versao?: number): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success) return { ok: false, erro: 'Conversa inválida' };

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  if (!Number.isInteger(versao) || !versao || versao < 1) return {ok:false,erro:'Atualize o atendimento antes de concluir.'};
  const { data: encerrou, error } = await supabase.rpc('encerrar_conversa_com_versao', {
    p_conversa_id: conversaId,
    p_membro_id: sessao.membro.id,
    p_versao: versao,
    p_motivo: motivo?.trim() || null,
  });

  if (error || !encerrou) {
    return { ok: false, erro: 'O atendimento mudou ou há um envio em confirmação. Atualize e confira as mensagens antes de concluir.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONVERSA_ENCERRADA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'conversas',
    entidadeId: conversaId,
    metadados: { motivo: motivo ?? null },
  });

  revalidatePath('/atendimento');
  return { ok: true };
}

export async function reabrirConversa(conversaId: string, paraIa: boolean): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success) return { ok: false, erro: 'Conversa inválida' };

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  const { data: reabriu, error } = await supabase.rpc('reabrir_conversa', {
    p_conversa_id: conversaId,
    p_membro_id: sessao.membro.id,
    p_para_ia: paraIa,
  });

  if (error) return { ok: false, erro: 'Não foi possível reabrir a conversa.' };

  if (!reabriu) {
    return {
      ok: false,
      erro: 'Este contato já tem uma conversa aberta neste canal. Abra a conversa atual em vez de reabrir esta.',
    };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CONVERSA_REABERTA,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'conversas',
    entidadeId: conversaId,
    metadados: { para_ia: paraIa },
  });

  revalidatePath('/atendimento');
  return { ok: true };
}

const esquemaMensagem = z.object({
  conversaId: uuid,
  texto: z.string().trim().min(1, 'Escreva alguma coisa').max(4000, 'Mensagem longa demais'),
});

/**
 * Envio manual do atendente.
 *
 * Enviar assume a conversa automaticamente: escrever para o cliente e
 * deixar a IA continuar respondendo em paralelo é exatamente o problema
 * que o produto promete não ter.
 */
export async function enviarMensagemManual(entrada: {
  conversaId: string;
  texto: string;
}): Promise<Resultado> {
  const conferido = esquemaMensagem.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Mensagem inválida' };
  }

  const { sessao, supabase, conversa } = await carregarConversa(conferido.data.conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  if (conversa.estado === 'ENCERRADA') {
    return { ok: false, erro: 'Esta conversa está encerrada. Reabra antes de responder.' };
  }

  if (conversa.estado !== 'HUMANO' || conversa.responsavel_id !== sessao.membro.id) {
    const { data: assumiu } = await supabase.rpc('assumir_conversa', {
      p_conversa_id: conferido.data.conversaId,
      p_membro_id: sessao.membro.id,
      p_motivo: 'Assumida ao responder',
    });

    if (!assumiu) {
      return {
        ok: false,
        erro: 'Esta conversa está com outro atendente. Peça a transferência antes de responder.',
      };
    }
  }

  // O estado do canal só decide o aviso no fim; consultá-lo junto com a
  // gravação tira uma ida ao banco do caminho do envio.
  const consultaCanal = supabase.from('canais').select('status, ativo').eq('id', conversa.canal_id).maybeSingle();

  try {
    const [resultado, { data: canal }] = await Promise.all([
      enviarMensagem(supabase, {
        organizacaoId: sessao.organizacao.id,
        conversaId: conversa.id,
        contatoId: conversa.contato_id,
        canalId: conversa.canal_id,
        autor: 'ATENDENTE',
        autorMembroId: sessao.membro.id,
        conteudo: conferido.data.texto,
        chaveIdempotencia: chaveEnvioManual(conversa.id, sessao.membro.id, conferido.data.texto),
        remetenteNome: sessao.perfil.nome || sessao.perfil.email,
      }),
      consultaCanal,
    ]);

    if (!resultado.mensagemId) {
      return { ok: false, erro: 'Não foi possível registrar a mensagem.' };
    }

    // Auditoria depois da resposta: ela nunca derruba o envio (ver
    // lib/auditoria.ts), então não há motivo para o atendente esperar por ela.
    const mensagemId = resultado.mensagemId;
    after(() =>
      registrarAuditoria({
        organizacaoId: sessao.organizacao.id,
        acao: ACOES.MENSAGEM_ENVIADA,
        atorPerfilId: sessao.perfil.id,
        atorEmail: sessao.perfil.email,
        entidade: 'mensagens',
        entidadeId: mensagemId,
        metadados: { conversa_id: conversa.id },
      }),
    );

    // Sem `revalidatePath` de propósito: ele refaria a página inteira no
    // servidor antes de responder. A tela já mostra o balão e o tempo real
    // traz a linha definitiva e a atualização da lista.

    // A mensagem já está gravada e será entregue assim que o canal voltar.
    // Avisar é honesto; recusar o envio faria o atendente digitar de novo.
    if (canal && (!canal.ativo || canal.status !== 'CONECTADO')) {
      return {
        ok: true,
        mensagemId,
        aviso: 'A mensagem foi registrada, mas o canal não está conectado. Ela será entregue quando a conexão voltar.',
      };
    }

    return { ok: true, mensagemId };
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) {
      return { ok: false, erro: erro.message };
    }

    log.error('Falha ao enviar mensagem manual', {
      organizacao_id: sessao.organizacao.id,
      conversa_id: conversa.id,
      erro: erro instanceof Error ? erro.message : String(erro),
    });

    return {
      ok: false,
      erro: 'A mensagem foi gravada, mas não foi possível enfileirar o envio. Confira a configuração do Redis.',
    };
  }
}

/** Nota de voz gravada no navegador raramente passa disso. */
const TAMANHO_MAXIMO_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Áudio gravado na própria tela do atendente. A conversão para o formato
 * que o WhatsApp exige numa nota de voz (ogg/opus) acontece depois, no
 * worker, na hora do despacho — ver `transcodificarParaNotaDeVoz` em
 * lib/servicos/envio.ts. Aqui só guarda o arquivo como o navegador mandou.
 */
export async function enviarAudioManual(entrada: FormData): Promise<Resultado> {
  const conversaId = entrada.get('conversaId');
  const audio = entrada.get('audio');

  if (typeof conversaId !== 'string' || !uuid.safeParse(conversaId).success) {
    return { ok: false, erro: 'Conversa inválida' };
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, erro: 'Nenhum áudio recebido' };
  }
  if (audio.size > TAMANHO_MAXIMO_AUDIO_BYTES) {
    return { ok: false, erro: 'Áudio muito grande (acima de 15 MB)' };
  }
  if (!audio.type.startsWith('audio/')) {
    return { ok: false, erro: 'Arquivo não é um áudio' };
  }

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  if (conversa.estado === 'ENCERRADA') {
    return { ok: false, erro: 'Esta conversa está encerrada. Reabra antes de responder.' };
  }

  if (conversa.estado !== 'HUMANO' || conversa.responsavel_id !== sessao.membro.id) {
    const { data: assumiu } = await supabase.rpc('assumir_conversa', {
      p_conversa_id: conversaId,
      p_membro_id: sessao.membro.id,
      p_motivo: 'Assumida ao responder',
    });

    if (!assumiu) {
      return {
        ok: false,
        erro: 'Esta conversa está com outro atendente. Peça a transferência antes de responder.',
      };
    }
  }

  const { data: canal } = await supabase
    .from('canais')
    .select('status, ativo')
    .eq('id', conversa.canal_id)
    .maybeSingle();

  try {
    const bytes = Buffer.from(await audio.arrayBuffer());

    const { obterProvedorArmazenamento } = await import('@/lib/provedores/armazenamento/indice');
    const guardado = await obterProvedorArmazenamento().guardar({
      organizacaoId: sessao.organizacao.id,
      conteudo: bytes,
      nomeArquivo: `nota-de-voz.${audio.type.includes('mp4') ? 'm4a' : 'webm'}`,
      tipoMime: audio.type,
    });

    const { data: arquivo, error: erroArquivo } = await supabase
      .from('arquivos')
      .insert({
        organizacao_id: sessao.organizacao.id,
        contato_id: conversa.contato_id,
        caminho: guardado.caminho,
        nome_arquivo: 'nota-de-voz',
        tipo_mime: audio.type,
        tamanho_bytes: guardado.tamanhoBytes,
        status_transcricao: 'NAO_APLICAVEL',
        status_analise: 'NAO_APLICAVEL',
      })
      .select('id')
      .single();

    if (erroArquivo || !arquivo) {
      throw new Error(erroArquivo?.message ?? 'falha ao registrar o arquivo');
    }

    const resultado = await enviarMensagem(supabase, {
      organizacaoId: sessao.organizacao.id,
      conversaId: conversa.id,
      contatoId: conversa.contato_id,
      canalId: conversa.canal_id,
      autor: 'ATENDENTE',
      autorMembroId: sessao.membro.id,
      tipo: 'AUDIO',
      conteudo: null,
      arquivoId: arquivo.id,
      chaveIdempotencia: chaveEnvioManual(conversa.id, sessao.membro.id, `audio:${guardado.tamanhoBytes}`),
      remetenteNome: sessao.perfil.nome || sessao.perfil.email,
    });

    if (!resultado.mensagemId) {
      return { ok: false, erro: 'Não foi possível registrar a mensagem.' };
    }

    await registrarAuditoria({
      organizacaoId: sessao.organizacao.id,
      acao: ACOES.MENSAGEM_ENVIADA,
      atorPerfilId: sessao.perfil.id,
      atorEmail: sessao.perfil.email,
      entidade: 'mensagens',
      entidadeId: resultado.mensagemId,
      metadados: { conversa_id: conversa.id, tipo: 'AUDIO' },
    });

    // Sem `revalidatePath`: quem chama (`executar`, na tela da conversa)
    // já recarrega a conversa; fazer as duas coisas refaria a página duas vezes.

    if (canal && (!canal.ativo || canal.status !== 'CONECTADO')) {
      return {
        ok: true,
        aviso: 'O áudio foi registrado, mas o canal não está conectado. Ele será entregue quando a conexão voltar.',
      };
    }

    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) {
      return { ok: false, erro: erro.message };
    }

    log.error('Falha ao enviar áudio manual', {
      organizacao_id: sessao.organizacao.id,
      conversa_id: conversa.id,
      erro: erro instanceof Error ? erro.message : String(erro),
    });

    return { ok: false, erro: 'Não foi possível enviar o áudio. Tenta de novo.' };
  }
}

const esquemaNota = z.object({
  conversaId: uuid,
  texto: z.string().trim().min(1, 'Escreva a nota').max(2000),
});

export async function adicionarNota(entrada: {
  conversaId: string;
  texto: string;
}): Promise<Resultado> {
  const conferido = esquemaNota.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Nota inválida' };
  }

  const { sessao, supabase, conversa } = await carregarConversa(conferido.data.conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  const { error } = await supabase.from('notas_internas').insert({
    organizacao_id: sessao.organizacao.id,
    conversa_id: conversa.id,
    autor_membro_id: sessao.membro.id,
    conteudo: conferido.data.texto,
  });

  if (error) return { ok: false, erro: 'Não foi possível salvar a nota.' };

  revalidatePath('/atendimento');
  return { ok: true };
}

export async function alternarEtiqueta(
  conversaId: string,
  etiquetaId: string,
  ativar: boolean,
): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success || !uuid.safeParse(etiquetaId).success) {
    return { ok: false, erro: 'Dados inválidos' };
  }

  const { sessao, supabase, conversa } = await carregarConversa(conversaId);
  if (!conversa) return { ok: false, erro: 'Conversa não encontrada' };

  if (ativar) {
    const { error } = await supabase.from('etiquetas_conversa').upsert(
      {
        organizacao_id: sessao.organizacao.id,
        conversa_id: conversaId,
        etiqueta_id: etiquetaId,
      },
      { onConflict: 'conversa_id,etiqueta_id', ignoreDuplicates: true },
    );
    if (error) return { ok: false, erro: 'Não foi possível aplicar a etiqueta.' };
  } else {
    const { error } = await supabase
      .from('etiquetas_conversa')
      .delete()
      .eq('conversa_id', conversaId)
      .eq('etiqueta_id', etiquetaId)
      .eq('organizacao_id', sessao.organizacao.id);
    if (error) return { ok: false, erro: 'Não foi possível remover a etiqueta.' };
  }

  revalidatePath('/atendimento');
  return { ok: true };
}

/** Zera o contador de não lidas ao abrir a conversa. */
export async function marcarComoLida(conversaId: string): Promise<Resultado> {
  if (!uuid.safeParse(conversaId).success) return { ok: false, erro: 'Conversa inválida' };

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('conversas')
    .update({ nao_lidas: 0 })
    .eq('id', conversaId)
    .eq('organizacao_id', sessao.organizacao.id)
    .gt('nao_lidas', 0);

  if (error) return { ok: false, erro: 'Não foi possível marcar como lida.' };
  return { ok: true };
}

export interface ResultadoUrlMidia {
  ok: boolean;
  url?: string;
  tipoMime?: string | null;
  erro?: string;
}

/**
 * Link temporário para tocar/baixar um arquivo (áudio, imagem, documento)
 * de uma mensagem. Confere a organização antes de gerar o link — sem
 * isso, quem soubesse o id de um arquivo de outra empresa conseguiria
 * pedir o link dele diretamente por aqui, ignorando a tela.
 *
 * Devolve `ok: false` sem link, sem erro, quando o arquivo existe mas
 * ainda não foi baixado do provedor de mensageria (`caminho` nulo) — é o
 * caso normal nos primeiros segundos depois de a mídia chegar, antes do
 * worker terminar de processá-la. Não é falha: a tela tenta de novo.
 */
export async function obterUrlMidia(arquivoId: string): Promise<ResultadoUrlMidia> {
  if (!uuid.safeParse(arquivoId).success) return { ok: false, erro: 'Arquivo inválido' };

  const sessao = await exigirSessao();
  const supabase = await clienteServidor();

  const { data: arquivo } = await supabase
    .from('arquivos')
    .select('caminho, tipo_mime')
    .eq('id', arquivoId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!arquivo) return { ok: false, erro: 'Arquivo não encontrado' };
  if (!arquivo.caminho) return { ok: false };

  try {
    const { obterProvedorArmazenamento } = await import('@/lib/provedores/armazenamento/indice');
    const url = await obterProvedorArmazenamento().urlTemporaria(arquivo.caminho);
    return { ok: true, url, tipoMime: arquivo.tipo_mime };
  } catch (erro) {
    log.error('Falha ao gerar link de mídia', {
      organizacao_id: sessao.organizacao.id,
      arquivo_id: arquivoId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return { ok: false, erro: 'Não foi possível gerar o link do arquivo.' };
  }
}

export async function carregarMensagensAnteriores(conversaId:string,antes:string,ultimoId:string){
 if(!uuid.safeParse(conversaId).success||!uuid.safeParse(ultimoId).success||!z.string().datetime({offset:true}).safeParse(antes).success)return {ok:false as const,erro:'Cursor inválido.'};
 const {supabase,conversa}=await carregarConversa(conversaId);if(!conversa)return {ok:false as const,erro:'Conversa não disponível.'};
 const {data,error}=await supabase.from('mensagens').select('*').eq('conversa_id',conversaId).or('criado_em.lt.'+antes+',and(criado_em.eq.'+antes+',id.lt.'+ultimoId+')').order('criado_em',{ascending:false}).order('id',{ascending:false}).limit(60);
 if(error)return {ok:false as const,erro:'Não foi possível carregar o histórico.'};return {ok:true as const,mensagens:data.slice().reverse(),mais:data.length===60};
}
export async function conferirEntrega(mensagem:string,entregue:boolean){
 if(!uuid.safeParse(mensagem).success||typeof entregue!=='boolean')return {ok:false,erro:'Mensagem inválida.'};
 await exigirSessao();const db=await clienteServidor();const {error}=await db.rpc('resolver_despacho',{p_mensagem:mensagem,p_entregue:entregue});
 if(error)return {ok:false,erro:error.message};revalidatePath('/atendimento');revalidatePath('/configuracoes/canais');return {ok:true};
}
