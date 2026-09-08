/**
 * Montagem do contexto que vai para a IA.
 *
 * A regra é não mandar a conversa inteira a cada mensagem. O que vai é:
 *
 *   dados estruturados  (o que já se sabe, em campos)
 * + memória do contato  (fatos duráveis, nomeados)
 * + resumo incremental  (o histórico comprimido)
 * + últimas mensagens   (o fio da conversa atual)
 *
 * Assim uma conversa de trezentas mensagens continua cabendo — e, mais
 * importante, a IA para de repetir pergunta que o cliente já respondeu,
 * que é o defeito que mais denuncia atendimento automático.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BancoDados,
  CampoPersonalizado,
  Contato,
  Conversa,
  Departamento,
  Mensagem,
  MemoriaContato,
} from '@/lib/tipos-banco';
import { formatarTelefone } from '@/lib/nucleo/telefone';

type Cliente = SupabaseClient<BancoDados>;

/** Quantas mensagens recentes entram no contexto. */
export const LIMITE_MENSAGENS_RECENTES = 20;

export interface CampoComValor {
  campo: CampoPersonalizado;
  valor: string | null;
}

export interface ContextoConversa {
  contato: Contato;
  conversa: Conversa;
  campos: CampoComValor[];
  camposFaltando: CampoPersonalizado[];
  memorias: MemoriaContato[];
  mensagensRecentes: Mensagem[];
  departamentos: Departamento[];
  etiquetas: string[];
  totalMensagens: number;
}

export async function montarContexto(
  cliente: Cliente,
  conversa: Conversa,
): Promise<ContextoConversa> {
  const organizacaoId = conversa.organizacao_id;

  const [contatoResposta, camposResposta, valoresResposta, memoriasResposta, mensagensResposta, departamentosResposta, etiquetasResposta, totalResposta] =
    await Promise.all([
      cliente.from('contatos').select('*').eq('id', conversa.contato_id).eq('organizacao_id', organizacaoId).single(),
      cliente
        .from('campos_personalizados')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('ativo', true)
        .order('ordem'),
      cliente
        .from('valores_campos_contato')
        .select('campo_id, valor')
        .eq('organizacao_id', organizacaoId)
        .eq('contato_id', conversa.contato_id),
      cliente
        .from('memorias_contato')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('contato_id', conversa.contato_id)
        .eq('ativo', true)
        .order('atualizado_em', { ascending: false })
        .limit(40),
      cliente
        .from('mensagens')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('conversa_id', conversa.id)
        .order('criado_em', { ascending: false })
        .limit(LIMITE_MENSAGENS_RECENTES),
      cliente
        .from('departamentos')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('ativo', true)
        .order('ordem'),
      cliente
        .from('etiquetas_contato')
        .select('etiquetas(nome)')
        .eq('organizacao_id', organizacaoId)
        .eq('contato_id', conversa.contato_id),
      cliente
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('organizacao_id', organizacaoId)
        .eq('conversa_id', conversa.id),
    ]);

  if (contatoResposta.error || !contatoResposta.data) {
    throw new Error(`Contato da conversa não encontrado: ${contatoResposta.error?.message ?? ''}`);
  }

  const campos = camposResposta.data ?? [];
  const valores = new Map(
    (valoresResposta.data ?? []).map((linha) => [linha.campo_id, linha.valor]),
  );

  const camposComValor: CampoComValor[] = campos.map((campo) => ({
    campo,
    valor: valores.get(campo.id) ?? null,
  }));

  const camposFaltando = camposComValor
    .filter((item) => item.campo.obrigatorio_para_qualificacao && !item.valor)
    .map((item) => item.campo);

  const etiquetas = (etiquetasResposta.data ?? [])
    .map((linha) => (linha.etiquetas as unknown as { nome: string } | null)?.nome)
    .filter((nome): nome is string => Boolean(nome));

  return {
    contato: contatoResposta.data,
    conversa,
    campos: camposComValor,
    camposFaltando,
    memorias: memoriasResposta.data ?? [],
    // O banco devolve do mais novo para o mais velho; a conversa se lê ao contrário.
    mensagensRecentes: (mensagensResposta.data ?? []).slice().reverse(),
    departamentos: departamentosResposta.data ?? [],
    etiquetas,
    totalMensagens: totalResposta.count ?? 0,
  };
}

/** Ficha do contato em texto, para entrar no prompt. */
export function descreverContato(contexto: ContextoConversa): string {
  const { contato, campos, memorias, etiquetas } = contexto;
  const linhas: string[] = [];

  linhas.push(`Nome: ${contato.nome ?? contato.nome_perfil_whatsapp ?? 'não informado'}`);
  linhas.push(`Telefone: ${formatarTelefone(contato.telefone)}`);
  linhas.push(`Já é cliente: ${contato.eh_cliente ? 'sim' : 'não'}`);

  if (contato.origem) linhas.push(`Origem: ${contato.origem}`);
  if (etiquetas.length) linhas.push(`Etiquetas: ${etiquetas.join(', ')}`);

  const preenchidos = campos.filter((item) => item.valor);
  if (preenchidos.length) {
    linhas.push('');
    linhas.push('Dados já coletados:');
    for (const item of preenchidos) {
      linhas.push(`- ${item.campo.rotulo} (${item.campo.chave}): ${item.valor}`);
    }
  }

  if (memorias.length) {
    linhas.push('');
    linhas.push('Memória do contato:');
    for (const memoria of memorias) {
      linhas.push(`- [${memoria.tipo}] ${memoria.chave}: ${memoria.conteudo}`);
    }
  }

  if (contato.resumo) {
    linhas.push('');
    linhas.push('Resumo do histórico:');
    linhas.push(contato.resumo);
  }

  if (contato.observacoes) {
    linhas.push('');
    linhas.push(`Observações internas: ${contato.observacoes}`);
  }

  return linhas.join('\n');
}

/** O que ainda falta coletar, com a instrução de cada campo. */
export function descreverCamposFaltando(contexto: ContextoConversa): string {
  if (!contexto.camposFaltando.length) {
    return 'Nada obrigatório em aberto. Não faça perguntas de cadastro sem necessidade.';
  }

  return contexto.camposFaltando
    .map((campo) => {
      const partes = [`- ${campo.chave} (${campo.rotulo})`];
      if (campo.instrucao_ia) partes.push(`  Como abordar: ${campo.instrucao_ia}`);
      const opcoes = Array.isArray(campo.opcoes) ? (campo.opcoes as unknown[]) : [];
      if (opcoes.length) partes.push(`  Valores aceitos: ${opcoes.join(', ')}`);
      return partes.join('\n');
    })
    .join('\n');
}

export function descreverDepartamentos(contexto: ContextoConversa): string {
  if (!contexto.departamentos.length) {
    return 'Nenhum departamento cadastrado. Se precisar de humano, deixe departamento_sugerido como null.';
  }

  return contexto.departamentos
    .map((departamento) => {
      const partes = [`- ${departamento.chave} (${departamento.nome})`];
      if (departamento.criterio_transferencia) {
        partes.push(`  Quando encaminhar: ${departamento.criterio_transferencia}`);
      } else if (departamento.descricao) {
        partes.push(`  ${departamento.descricao}`);
      }
      return partes.join('\n');
    })
    .join('\n');
}

/** Histórico recente no formato de diálogo. */
export function descreverHistorico(contexto: ContextoConversa): string {
  if (!contexto.mensagensRecentes.length) return '(sem mensagens anteriores)';

  return contexto.mensagensRecentes
    .map((mensagem) => {
      const quem =
        mensagem.autor === 'CONTATO'
          ? 'Cliente'
          : mensagem.autor === 'IA'
            ? 'Você'
            : mensagem.autor === 'ATENDENTE'
              ? 'Atendente humano'
              : 'Sistema';

      const conteudo = mensagem.conteudo?.trim() || descreverMensagemSemTexto(mensagem);
      return `${quem}: ${conteudo}`;
    })
    .join('\n');
}

function descreverMensagemSemTexto(mensagem: Mensagem): string {
  switch (mensagem.tipo) {
    case 'AUDIO':
      return '(áudio sem transcrição disponível)';
    case 'IMAGEM':
      return '(imagem enviada)';
    case 'DOCUMENTO':
      return '(documento enviado)';
    case 'VIDEO':
      return '(vídeo enviado)';
    default:
      return '(mensagem sem texto)';
  }
}
