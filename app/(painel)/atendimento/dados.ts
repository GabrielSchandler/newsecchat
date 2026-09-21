import 'server-only';

/**
 * Consultas da central de atendimento.
 *
 * As junções são feitas em JavaScript, com uma consulta por tabela, em
 * vez de `select` aninhado do PostgREST. O motivo é prático: o tipo do
 * banco é escrito à mão e não descreve os relacionamentos, então o
 * aninhado voltaria sem tipo e obrigaria a converter na marra em cada
 * ponto. Com listas de no máximo algumas dezenas de linhas, o custo de
 * quatro consultas indexadas é irrelevante perto de perder a checagem de
 * tipo da tela inteira.
 */
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  CONTAGENS_VAZIAS,
  estadosDaCaixa,
  type ApoioAtendimento,
  type ContagensCaixas,
  type ConversaDaLista,
  type DetalheConversa,
  type FiltrosLista,
} from './tipos';
import type { Departamento, Perfil } from '@/lib/tipos-banco';

export async function carregarListaConversas(
  organizacaoId: string,
  membroId: string,
  filtros: FiltrosLista,
): Promise<ConversaDaLista[]> {
  const supabase = await clienteServidor();

  let consulta = supabase
    .from('conversas')
    .select('*')
    .eq('organizacao_id', organizacaoId)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(60);

  const estados = estadosDaCaixa(filtros.caixa);

  if (estados) {
    consulta = consulta.in('estado', estados);
  } else if (filtros.caixa !== 'encerradas') {
    consulta = consulta.neq('estado', 'ENCERRADA');
  }

  if (filtros.caixa === 'minhas') consulta = consulta.eq('responsavel_id', membroId);
  if (filtros.caixa === 'nao-atribuidas') consulta = consulta.is('responsavel_id', null);
  if (filtros.departamentoId) consulta = consulta.eq('departamento_id', filtros.departamentoId);

  const { data: conversas, error } = await consulta;
  if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);
  if (!conversas?.length) return [];

  const idsContatos = [...new Set(conversas.map((item) => item.contato_id))];
  const idsCanais = [...new Set(conversas.map((item) => item.canal_id))];
  const idsDepartamentos = [
    ...new Set(conversas.map((item) => item.departamento_id).filter((id): id is string => Boolean(id))),
  ];
  const idsResponsaveis = [
    ...new Set(conversas.map((item) => item.responsavel_id).filter((id): id is string => Boolean(id))),
  ];

  const [contatosResposta, canaisResposta, departamentosResposta, responsaveis] = await Promise.all([
    supabase
      .from('contatos')
      .select('id, nome, telefone, nome_perfil_whatsapp')
      .eq('organizacao_id', organizacaoId)
      .in('id', idsContatos),
    supabase.from('canais').select('id, nome').eq('organizacao_id', organizacaoId).in('id', idsCanais),
    idsDepartamentos.length
      ? supabase
          .from('departamentos')
          .select('id, nome, cor')
          .eq('organizacao_id', organizacaoId)
          .in('id', idsDepartamentos)
      : Promise.resolve({ data: [] as Pick<Departamento, 'id' | 'nome' | 'cor'>[] }),
    idsResponsaveis.length
      ? carregarNomesDeMembros(organizacaoId, idsResponsaveis)
      : Promise.resolve(new Map<string, string>()),
  ]);

  const contatos = new Map((contatosResposta.data ?? []).map((item) => [item.id, item]));
  const canais = new Map((canaisResposta.data ?? []).map((item) => [item.id, item]));
  const departamentos = new Map((departamentosResposta.data ?? []).map((item) => [item.id, item]));

  const lista: ConversaDaLista[] = conversas.map((conversa) => ({
    conversa,
    contato: contatos.get(conversa.contato_id) ?? null,
    canal: canais.get(conversa.canal_id) ?? null,
    departamento: conversa.departamento_id ? departamentos.get(conversa.departamento_id) ?? null : null,
    responsavelNome: conversa.responsavel_id ? responsaveis.get(conversa.responsavel_id) ?? null : null,
  }));

  const busca = filtros.busca?.trim().toLowerCase();
  if (!busca) return lista;

  // Busca aplicada na memória: a lista já está limitada a 60 linhas, e
  // filtrar aqui evita uma consulta com OR entre tabelas diferentes.
  const digitos = busca.replace(/\D/g, '');
  return lista.filter((item) => {
    const nome = (item.contato?.nome ?? item.contato?.nome_perfil_whatsapp ?? '').toLowerCase();
    const telefone = item.contato?.telefone ?? '';
    return nome.includes(busca) || (digitos.length >= 3 && telefone.includes(digitos));
  });
}

async function carregarNomesDeMembros(
  organizacaoId: string,
  idsMembros: string[],
): Promise<Map<string, string>> {
  const supabase = await clienteServidor();

  const { data: membros } = await supabase
    .from('membros_organizacao')
    .select('id, perfil_id')
    .eq('organizacao_id', organizacaoId)
    .in('id', idsMembros);

  if (!membros?.length) return new Map();

  const { data: perfis } = await supabase
    .from('perfis')
    .select('id, nome, email')
    .in('id', membros.map((membro) => membro.perfil_id));

  const porPerfil = new Map((perfis ?? []).map((perfil) => [perfil.id, perfil.nome || perfil.email]));

  return new Map(
    membros.map((membro) => [membro.id, porPerfil.get(membro.perfil_id) ?? 'Atendente']),
  );
}

export async function carregarDetalheConversa(
  organizacaoId: string,
  conversaId: string,
): Promise<DetalheConversa | null> {
  const supabase = await clienteServidor();

  const { data: conversa } = await supabase
    .from('conversas')
    .select('*')
    .eq('id', conversaId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle();

  if (!conversa) return null;

  const [contatoResposta, canalResposta, mensagensResposta, notasResposta, memoriasResposta, eventosResposta] =
    await Promise.all([
      supabase
        .from('contatos')
        .select('*')
        .eq('id', conversa.contato_id)
        .eq('organizacao_id', organizacaoId)
        .single(),
      supabase
        .from('canais')
        .select('id, nome, status, ativo, ia_ativa')
        .eq('id', conversa.canal_id)
        .eq('organizacao_id', organizacaoId)
        .maybeSingle(),
      supabase
        .from('mensagens')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('conversa_id', conversaId)
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })
        .limit(120),
      supabase
        .from('notas_internas')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('conversa_id', conversaId)
        .order('criado_em', { ascending: false })
        .limit(30),
      supabase
        .from('memorias_contato')
        .select('*')
        .eq('organizacao_id', organizacaoId)
        .eq('contato_id', conversa.contato_id)
        .eq('ativo', true)
        .order('atualizado_em', { ascending: false })
        .limit(20),
      supabase.from("eventos_conversa").select("*").eq("organizacao_id",organizacaoId).eq("conversa_id",conversaId).order("criado_em",{ascending:false}).limit(60),
    ]);

  if (contatoResposta.error || !contatoResposta.data) return null;

  const [campos, etiquetasContato, etiquetasConversa, departamento, responsavelNome, campanhaNome, autoresNotas] =
    await Promise.all([
      carregarCamposDoContato(organizacaoId, conversa.contato_id),
      carregarEtiquetas(organizacaoId, 'contato', conversa.contato_id),
      carregarEtiquetas(organizacaoId, 'conversa', conversaId),
      conversa.departamento_id
        ? supabase
            .from('departamentos')
            .select('*')
            .eq('id', conversa.departamento_id)
            .maybeSingle()
            .then((resposta) => resposta.data ?? null)
        : Promise.resolve(null),
      conversa.responsavel_id
        ? carregarNomesDeMembros(organizacaoId, [conversa.responsavel_id]).then(
            (mapa) => mapa.get(conversa.responsavel_id as string) ?? null,
          )
        : Promise.resolve(null),
      conversa.campanha_id
        ? supabase
            .from('campanhas')
            .select('nome')
            .eq('id', conversa.campanha_id)
            .maybeSingle()
            .then((resposta) => resposta.data?.nome ?? null)
        : Promise.resolve(null),
      carregarNomesDeMembros(
        organizacaoId,
        [
          ...new Set(
            (notasResposta.data ?? [])
              .map((nota) => nota.autor_membro_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ],
      ),
    ]);

  return {
    conversa,
    contato: contatoResposta.data,
    canal: canalResposta.data ?? null,
    departamento,
    responsavelNome,
    // Vieram do mais novo para o mais velho; a tela lê ao contrário.
    mensagens: (mensagensResposta.data ?? []).slice().reverse(),
    notas: (notasResposta.data ?? []).map((nota) => ({
      ...nota,
      autorNome: nota.autor_membro_id ? autoresNotas.get(nota.autor_membro_id) ?? null : null,
    })),
    memorias: memoriasResposta.data ?? [],
    eventos: eventosResposta.data ?? [],
    campos,
    etiquetasDoContato: etiquetasContato,
    etiquetasDaConversa: etiquetasConversa,
    campanhaNome,
  };
}

async function carregarCamposDoContato(
  organizacaoId: string,
  contatoId: string,
): Promise<{ chave: string; rotulo: string; valor: string | null }[]> {
  const supabase = await clienteServidor();

  const [camposResposta, valoresResposta] = await Promise.all([
    supabase
      .from('campos_personalizados')
      .select('id, chave, rotulo, ordem')
      .eq('organizacao_id', organizacaoId)
      .eq('ativo', true)
      .order('ordem'),
    supabase
      .from('valores_campos_contato')
      .select('campo_id, valor')
      .eq('organizacao_id', organizacaoId)
      .eq('contato_id', contatoId),
  ]);

  const valores = new Map((valoresResposta.data ?? []).map((item) => [item.campo_id, item.valor]));

  return (camposResposta.data ?? []).map((campo) => ({
    chave: campo.chave,
    rotulo: campo.rotulo,
    valor: valores.get(campo.id) ?? null,
  }));
}

async function carregarEtiquetas(
  organizacaoId: string,
  alvo: 'contato' | 'conversa',
  alvoId: string,
): Promise<string[]> {
  const supabase = await clienteServidor();

  const resposta =
    alvo === 'contato'
      ? await supabase
          .from('etiquetas_contato')
          .select('etiqueta_id')
          .eq('organizacao_id', organizacaoId)
          .eq('contato_id', alvoId)
      : await supabase
          .from('etiquetas_conversa')
          .select('etiqueta_id')
          .eq('organizacao_id', organizacaoId)
          .eq('conversa_id', alvoId);

  return (resposta.data ?? []).map((linha) => linha.etiqueta_id);
}

export async function carregarApoio(organizacaoId: string): Promise<ApoioAtendimento> {
  const supabase = await clienteServidor();

  const [departamentosResposta, etiquetasResposta, membrosResposta] = await Promise.all([
    supabase
      .from('departamentos')
      .select('*')
      .eq('organizacao_id', organizacaoId)
      .eq('ativo', true)
      .order('ordem'),
    supabase.from('etiquetas').select('*').eq('organizacao_id', organizacaoId).order('nome'),
    supabase
      .from('membros_organizacao')
      .select('id, perfil_id, papel')
      .eq('organizacao_id', organizacaoId)
      .eq('ativo', true),
  ]);

  const membros = membrosResposta.data ?? [];
  const { data: perfis } = membros.length
    ? await supabase
        .from('perfis')
        .select('id, nome, email')
        .in('id', membros.map((membro) => membro.perfil_id))
    : { data: [] as Pick<Perfil, 'id' | 'nome' | 'email'>[] };

  const porPerfil = new Map((perfis ?? []).map((perfil) => [perfil.id, perfil.nome || perfil.email]));

  return {
    departamentos: departamentosResposta.data ?? [],
    etiquetas: etiquetasResposta.data ?? [],
    atendentes: membros
      .map((membro) => ({
        membroId: membro.id,
        nome: porPerfil.get(membro.perfil_id) ?? 'Atendente',
        papel: membro.papel,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

export async function carregarContagens(organizacaoId: string): Promise<ContagensCaixas> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase.rpc('contagens_caixas', {
    p_organizacao_id: organizacaoId,
  });

  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return CONTAGENS_VAZIAS;

  const bruto = data as Record<string, unknown>;
  const numero = (chave: string): number =>
    typeof bruto[chave] === 'number' ? (bruto[chave] as number) : 0;

  return {
    minhas: numero('minhas'),
    nao_atribuidas: numero('nao_atribuidas'),
    ia: numero('ia'),
    aguardando_humano: numero('aguardando_humano'),
    aguardando_cliente: numero('aguardando_cliente'),
    humano: numero('humano'),
    encerradas: numero('encerradas'),
    todas: numero('todas'),
  };
}

export * from './tipos';
