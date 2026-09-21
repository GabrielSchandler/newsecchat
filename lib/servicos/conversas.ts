/**
 * Resolução de contato e conversa a partir de uma mensagem que chegou.
 *
 * Roda no worker, com a chave de serviço (sem RLS), então todo filtro por
 * `organizacao_id` é explícito aqui — não há rede abaixo.
 *
 * Os dois pontos de corrida estão tratados:
 *
 * - Contato: `upsert` na chave (organizacao_id, telefone).
 * - Conversa: índice parcial garante UMA conversa aberta por contato e
 *   canal. Se dois eventos chegarem juntos, o segundo esbarra no índice,
 *   relê e usa a conversa que o primeiro criou.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BancoDados, Canal, Contato, Conversa, TipoMensagem } from '@/lib/tipos-banco';
import { variantesBrasil } from '@/lib/nucleo/telefone';
import { log } from '@/lib/log';

type Cliente = SupabaseClient<BancoDados>;

const CODIGO_DUPLICADO = '23505';

export interface DadosContato {
  telefone: string;
  nomeExibicao?: string | null;
  origem?: string | null;
}

/**
 * Encontra o contato pelo telefone, aceitando as variações do nono
 * dígito. Cria se não existir.
 */
export async function resolverContato(
  cliente: Cliente,
  organizacaoId: string,
  dados: DadosContato,
): Promise<Contato> {
  const variantes = variantesBrasil(dados.telefone);
  if (variantes.length === 0) {
    throw new Error(`Telefone inválido: ${dados.telefone}`);
  }

  const { data: existentes, error: erroBusca } = await cliente
    .from('contatos')
    .select('*')
    .eq('organizacao_id', organizacaoId)
    .in('telefone', variantes)
    .order('criado_em', { ascending: true })
    .limit(1);

  if (erroBusca) throw new Error(`Falha ao buscar contato: ${erroBusca.message}`);

  const existente = existentes?.[0];
  if (existente) {
    // O nome do perfil do WhatsApp muda com o tempo; vale manter o mais
    // recente sem sobrescrever um nome que um atendente digitou.
    if (dados.nomeExibicao && dados.nomeExibicao !== existente.nome_perfil_whatsapp) {
      await cliente
        .from('contatos')
        .update({
          nome_perfil_whatsapp: dados.nomeExibicao,
          nome: existente.nome ?? dados.nomeExibicao,
        })
        .eq('id', existente.id)
        .eq('organizacao_id', organizacaoId);
    }
    return existente;
  }

  const telefoneCanonico = variantes[0] as string;

  const { data: criado, error: erroCriacao } = await cliente
    .from('contatos')
    .insert({
      organizacao_id: organizacaoId,
      telefone: telefoneCanonico,
      nome: dados.nomeExibicao ?? null,
      nome_perfil_whatsapp: dados.nomeExibicao ?? null,
      origem: dados.origem ?? 'WHATSAPP',
    })
    .select('*')
    .single();

  if (erroCriacao) {
    if (erroCriacao.code === CODIGO_DUPLICADO) {
      // Outro processo criou entre a busca e a inserção.
      const { data: recuperado } = await cliente
        .from('contatos')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('telefone', telefoneCanonico)
        .single();

      if (recuperado) return recuperado;
    }
    throw new Error(`Falha ao criar contato: ${erroCriacao.message}`);
  }

  return criado;
}

/** Conversa aberta do contato neste canal. Cria se não houver. */
export async function resolverConversaAberta(
  cliente: Cliente,
  canal: Pick<Canal, 'id' | 'organizacao_id' | 'departamento_id' | 'ia_ativa'>,
  contato: Contato,
): Promise<Conversa> {
  const { data: aberta, error: erroBusca } = await cliente
    .from('conversas')
    .select('*')
    .eq('organizacao_id', canal.organizacao_id)
    .eq('contato_id', contato.id)
    .eq('canal_id', canal.id)
    .neq('estado', 'ENCERRADA')
    .limit(1)
    .maybeSingle();

  if (erroBusca) throw new Error(`Falha ao buscar conversa: ${erroBusca.message}`);
  if (aberta) return aberta;

  const reabertura = await cliente.rpc('reabrir_ao_receber', {p_contato:contato.id,p_canal:canal.id,p_org:canal.organizacao_id});
  if(reabertura.error)throw new Error('Não foi possível conferir a reabertura: '+reabertura.error.message);
  if(reabertura.data?.[0])return reabertura.data[0];
  // Canal sem IA nasce direto na fila humana; com IA, nasce com a IA.
  const estadoInicial = canal.ia_ativa ? 'IA' : 'AGUARDANDO_HUMANO';

  const { data: criada, error: erroCriacao } = await cliente
    .from('conversas')
    .insert({
      organizacao_id: canal.organizacao_id,
      contato_id: contato.id,
      canal_id: canal.id,
      estado: estadoInicial,
      departamento_id: contato.departamento_id ?? canal.departamento_id ?? null,
      responsavel_id: contato.responsavel_id ?? null,
    })
    .select('*')
    .single();

  if (erroCriacao) {
    if (erroCriacao.code === CODIGO_DUPLICADO) {
      const { data: recuperada } = await cliente
        .from('conversas')
        .select('*')
        .eq('organizacao_id', canal.organizacao_id)
        .eq('contato_id', contato.id)
        .eq('canal_id', canal.id)
        .neq('estado', 'ENCERRADA')
        .limit(1)
        .maybeSingle();

      if (recuperada) return recuperada;
    }
    throw new Error(`Falha ao criar conversa: ${erroCriacao.message}`);
  }

  return criada;
}

export interface MensagemRecebidaParaGravar {
  organizacaoId: string;
  conversaId: string;
  contatoId: string;
  canalId: string;
  tipo: TipoMensagem;
  conteudo: string | null;
  identificadorExterno: string;
  arquivoId?: string | null;
  recebidoEm: string;
  metadados?: Record<string, unknown>;
}

export interface ResultadoGravacao {
  mensagemId: string | null;
  /** true quando a mensagem já existia — webhook reentregue. */
  duplicada: boolean;
}

/**
 * Grava a mensagem recebida. A unicidade de
 * (organizacao_id, identificador_externo) é o que torna o webhook
 * reentregue inofensivo: a segunda vez não insere nada e o chamador para.
 */
export async function gravarMensagemRecebida(
  cliente: Cliente,
  dados: MensagemRecebidaParaGravar,
): Promise<ResultadoGravacao> {
  const { data, error } = await cliente
    .from('mensagens')
    .insert({
      organizacao_id: dados.organizacaoId,
      conversa_id: dados.conversaId,
      contato_id: dados.contatoId,
      canal_id: dados.canalId,
      direcao: 'ENTRADA',
      autor: 'CONTATO',
      tipo: dados.tipo,
      conteudo: dados.conteudo,
      arquivo_id: dados.arquivoId ?? null,
      identificador_externo: dados.identificadorExterno,
      status: 'ENTREGUE',
      criado_em: dados.recebidoEm,
      metadados: (dados.metadados ?? {}) as never,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === CODIGO_DUPLICADO) {
      log.info('Mensagem já registrada; webhook reentregue', {
        organizacao_id: dados.organizacaoId,
        conversa_id: dados.conversaId,
      });
      return { mensagemId: null, duplicada: true };
    }
    throw new Error(`Falha ao gravar mensagem: ${error.message}`);
  }

  return { mensagemId: data.id, duplicada: false };
}

/**
 * Atualiza a conversa depois de uma mensagem do cliente.
 *
 * A transição respeita a máquina de estados: conversa em HUMANO continua
 * em HUMANO, e é isso que impede a IA de voltar a falar só porque o
 * cliente respondeu.
 */
export async function atualizarConversaAposMensagem(
  cliente: Cliente,
  conversa: Conversa,
  previa: string,
  recebidoEm: string,
): Promise<Conversa['estado']> {
  const { data, error } = await cliente.rpc('atualizar_conversa_recebida', {
    p_conversa: conversa.id, p_org: conversa.organizacao_id, p_previa: previa, p_recebido: recebidoEm,
  });
  if (error) throw new Error('Falha ao atualizar conversa: ' + error.message);
  return data;
}

/** Texto curto que representa a mensagem na lista de conversas. */
export function previaDaMensagem(tipo: TipoMensagem, conteudo: string | null): string {
  if (conteudo && conteudo.trim()) return conteudo.trim();

  const rotulos: Partial<Record<TipoMensagem, string>> = {
    IMAGEM: '📷 Imagem',
    AUDIO: '🎤 Áudio',
    VIDEO: '🎬 Vídeo',
    DOCUMENTO: '📄 Documento',
    STICKER: 'Figurinha',
    LOCALIZACAO: '📍 Localização',
    CONTATO: '👤 Contato',
  };

  return rotulos[tipo] ?? 'Mensagem';
}
