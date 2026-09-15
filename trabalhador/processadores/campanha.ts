/**
 * Execução de campanha — um destinatário por vez.
 *
 * O trabalho processa UM contato e reagenda a si mesmo com o intervalo
 * configurado. Não existe laço disparando mil mensagens: cada envio é um
 * trabalho, com registro próprio, que pode falhar e ser repetido sem
 * arrastar o resto.
 *
 * A reserva do destinatário é feita no banco com FOR UPDATE SKIP LOCKED
 * (`reservar_contato_campanha`), então mesmo que dois workers peguem a
 * mesma campanha, cada mensagem sai uma vez só.
 *
 * Sobre variações de mensagem: existem para personalização e teste A/B, e
 * a escolha é determinística por contato. Não são, e não devem virar,
 * ferramenta para escapar de detecção de spam.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { resolverConversaAberta } from '@/lib/servicos/conversas';
import { criarMensagemSaida } from '@/lib/servicos/envio';
import { aplicarModelo, escolherVariacao } from '@/lib/nucleo/modelos';
import { dentroDaJanela, intervaloEntreEnvios, milissegundosAteAbrir } from '@/lib/nucleo/janela-envio';
import { chaveEnvioCampanha } from '@/lib/nucleo/idempotencia';
import { enfileirar } from '@/lib/filas/produtor';
import { FILAS, type TrabalhoCampanha } from '@/lib/filas/nomes';
import { log } from '@/lib/log';
import type { Campanha, Contato } from '@/lib/tipos-banco';

/**
 * Quanto tempo um passo segura a campanha enquanto trabalha. Se o worker
 * cair no meio, a varredura lenta assume depois disso.
 */
const PRAZO_PASSO_SEGUNDOS = 300;

export async function processarCampanha(trabalho: TrabalhoCampanha): Promise<void> {
  const supabase = clienteAdministrador();
  const registro = log.comContexto({
    organizacao_id: trabalho.organizacaoId,
    campanha_id: trabalho.campanhaId,
  });

  const { data: campanha, error } = await supabase
    .from('campanhas')
    .select('*')
    .eq('id', trabalho.campanhaId)
    .eq('organizacao_id', trabalho.organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler campanha: ${error.message}`);
  if (!campanha) {
    registro.warn('Campanha não encontrada');
    return;
  }

  if (campanha.status !== 'EM_EXECUCAO') {
    registro.info('Campanha não está em execução; ciclo encerrado', { status: campanha.status });
    return;
  }

  // Uma campanha tem UMA sequência de envios. Sem esta reivindicação,
  // qualquer trabalho a mais — a varredura de recuperação, um clique duplo
  // em "Retomar" — abriria outra sequência em paralelo, e a campanha
  // mandaria no dobro do ritmo configurado: o padrão de disparo que faz o
  // WhatsApp banir o número.
  const { data: podeSeguir, error: erroPasso } = await supabase.rpc('reivindicar_passo_campanha', {
    p_campanha_id: campanha.id,
    p_prazo_segundos: PRAZO_PASSO_SEGUNDOS,
  });

  if (erroPasso) throw new Error(`Falha ao reivindicar o passo da campanha: ${erroPasso.message}`);

  if (!podeSeguir) {
    registro.info('Outra sequência já conduz esta campanha; esta encerra aqui');
    return;
  }

  try {
    await darPasso(campanha, trabalho, registro);
  } catch (erro) {
    // Devolve a vez: sem isto, a nova tentativa da fila encontraria a
    // campanha ainda reservada por este passo e desistiria.
    await supabase.rpc('agendar_passo_campanha', { p_campanha_id: campanha.id, p_atraso_ms: 0 });
    throw erro;
  }
}

async function darPasso(
  campanha: Campanha,
  trabalho: TrabalhoCampanha,
  registro: ReturnType<typeof log.comContexto>,
): Promise<void> {
  const supabase = clienteAdministrador();

  const { data: organizacao } = await supabase
    .from('organizacoes')
    .select('fuso_horario')
    .eq('id', trabalho.organizacaoId)
    .maybeSingle();

  const janela = {
    inicio: campanha.janela_inicio.slice(0, 5),
    fim: campanha.janela_fim.slice(0, 5),
    diasSemana: campanha.dias_semana,
    fuso: organizacao?.fuso_horario ?? 'America/Sao_Paulo',
  };

  if (!dentroDaJanela(janela)) {
    const espera = milissegundosAteAbrir(janela);
    registro.info('Fora da janela de envio; campanha reagendada', {
      minutos_ate_abrir: Math.round(espera / 60000),
    });
    await reagendar(trabalho, espera);
    return;
  }

  const enviadosHoje = await contarEnviosDeHoje(trabalho, janela.fuso);
  if (enviadosHoje >= campanha.limite_diario) {
    const espera = milissegundosAteAbrir(janela, new Date(Date.now() + 12 * 60 * 60 * 1000));
    registro.info('Limite diário atingido; campanha retoma no próximo dia útil', {
      enviados_hoje: enviadosHoje,
    });
    await reagendar(trabalho, Math.max(espera, 60 * 60 * 1000));
    return;
  }

  const { data: reservadoId, error: erroReserva } = await supabase.rpc(
    'reservar_contato_campanha',
    { p_campanha_id: campanha.id },
  );

  if (erroReserva) throw new Error(`Falha ao reservar destinatário: ${erroReserva.message}`);

  if (!reservadoId) {
    registro.info('Nenhum destinatário pendente; campanha concluída');
    await supabase
      .from('campanhas')
      .update({ status: 'CONCLUIDA', concluida_em: new Date().toISOString() })
      .eq('id', campanha.id)
      .eq('organizacao_id', trabalho.organizacaoId)
      .eq('status', 'EM_EXECUCAO');
    return;
  }

  await processarDestinatario(campanha, reservadoId, registro);

  await reagendar(
    trabalho,
    intervaloEntreEnvios(campanha.intervalo_minimo_segundos, campanha.intervalo_maximo_segundos),
  );
}

async function processarDestinatario(
  campanha: Campanha,
  contatoCampanhaId: string,
  registro: ReturnType<typeof log.comContexto>,
): Promise<void> {
  const supabase = clienteAdministrador();

  const { data: destinatario } = await supabase
    .from('contatos_campanha')
    .select('*')
    .eq('id', contatoCampanhaId)
    .maybeSingle();

  if (!destinatario) return;

  const { data: contato } = await supabase
    .from('contatos')
    .select('*')
    .eq('id', destinatario.contato_id)
    .eq('organizacao_id', campanha.organizacao_id)
    .maybeSingle();

  if (!contato) {
    await concluir(contatoCampanhaId, 'FALHOU', { erro: 'Contato não encontrado' });
    return;
  }

  // Opt-out e bloqueio são conferidos AGORA, não na montagem da lista: o
  // contato pode ter pedido para sair entre a criação e o envio.
  if (!contato.aceita_campanha) {
    await concluir(contatoCampanhaId, 'IGNORADO', {
      motivo: 'Contato pediu para não receber campanhas',
    });
    return;
  }

  if (contato.bloqueado) {
    await concluir(contatoCampanhaId, 'IGNORADO', { motivo: 'Contato bloqueado' });
    return;
  }

  const { data: canal } = await supabase
    .from('canais')
    .select('*')
    .eq('id', campanha.canal_id)
    .eq('organizacao_id', campanha.organizacao_id)
    .maybeSingle();

  if (!canal || !canal.ativo) {
    await concluir(contatoCampanhaId, 'FALHOU', { erro: 'Canal indisponível' });
    return;
  }

  const texto = await montarTexto(campanha, contato);

  if (!texto.valido) {
    await concluir(contatoCampanhaId, 'IGNORADO', { motivo: texto.motivo });
    registro.info('Destinatário ignorado por falta de dado na mensagem', {
      contato_id: contato.id,
      motivo: texto.motivo,
    });
    return;
  }

  const conversa = await resolverConversaAberta(
    supabase,
    {
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      departamento_id: campanha.departamento_id ?? canal.departamento_id,
      ia_ativa: campanha.ia_assume_resposta && canal.ia_ativa,
    },
    contato,
  );

  await supabase
    .from('conversas')
    .update({
      campanha_id: campanha.id,
      departamento_id: campanha.departamento_id ?? conversa.departamento_id,
    })
    .eq('id', conversa.id)
    .eq('organizacao_id', campanha.organizacao_id);

  const { mensagemId, jaExistia } = await criarMensagemSaida(supabase, {
    organizacaoId: campanha.organizacao_id,
    conversaId: conversa.id,
    contatoId: contato.id,
    canalId: canal.id,
    autor: 'SISTEMA',
    conteudo: texto.conteudo,
    chaveIdempotencia: chaveEnvioCampanha(campanha.id, contato.id),
    campanhaId: campanha.id,
    metadados: { variacao: texto.variacao },
  });

  if (!mensagemId) {
    await concluir(contatoCampanhaId, 'FALHOU', { erro: 'Não foi possível gravar a mensagem' });
    return;
  }

  if (!jaExistia) {
    await enfileirar(
      FILAS.mensagensEnviadas,
      { mensagemId, organizacaoId: campanha.organizacao_id },
      { id: `envio:${mensagemId}` },
    );
  }

  await supabase
    .from('conversas')
    .update({
      estado: campanha.ia_assume_resposta && canal.ia_ativa ? 'AGUARDANDO_CLIENTE' : 'AGUARDANDO_HUMANO',
      ultima_mensagem_em: new Date().toISOString(),
      ultima_mensagem_previa: texto.conteudo.slice(0, 160),
    })
    .eq('id', conversa.id)
    .eq('organizacao_id', campanha.organizacao_id);

  await supabase
    .from('contatos_campanha')
    .update({ variacao_usada: texto.variacao })
    .eq('id', contatoCampanhaId);

  await concluir(contatoCampanhaId, 'ENVIADO', {
    mensagemId,
    conversaId: conversa.id,
  });

  registro.info('Mensagem de campanha enfileirada', {
    contato_id: contato.id,
    conversa_id: conversa.id,
  });
}

interface TextoCampanha {
  valido: boolean;
  conteudo: string;
  variacao: number | null;
  motivo?: string;
}

async function montarTexto(campanha: Campanha, contato: Contato): Promise<TextoCampanha> {
  const supabase = clienteAdministrador();

  const { data: valores } = await supabase
    .from('valores_campos_contato')
    .select('valor, campos_personalizados(chave)')
    .eq('organizacao_id', campanha.organizacao_id)
    .eq('contato_id', contato.id);

  const dados: Record<string, string | null> = {
    nome: contato.nome ?? contato.nome_perfil_whatsapp,
    telefone: contato.telefone,
  };

  for (const linha of valores ?? []) {
    const campo = linha.campos_personalizados as unknown as { chave: string } | null;
    if (campo?.chave) dados[campo.chave] = linha.valor;
  }

  const variacoes = Array.isArray(campanha.variacoes)
    ? (campanha.variacoes as unknown[]).map((item) => String(item))
    : [];

  const escolhida = escolherVariacao(variacoes, campanha.mensagem, contato.id);
  const resultado = aplicarModelo(escolhida.texto, dados);

  if (resultado.faltando.length) {
    // Mandar "Olá , tudo bem?" é pior que não mandar: denuncia disparo em
    // massa e queima o contato.
    return {
      valido: false,
      conteudo: '',
      variacao: escolhida.indice,
      motivo: `Sem valor para: ${resultado.faltando.join(', ')}`,
    };
  }

  return { valido: true, conteudo: resultado.texto, variacao: escolhida.indice };
}

async function concluir(
  contatoCampanhaId: string,
  status: 'ENVIADO' | 'FALHOU' | 'IGNORADO',
  extra: { mensagemId?: string; conversaId?: string; erro?: string; motivo?: string },
): Promise<void> {
  const { error } = await clienteAdministrador().rpc('concluir_contato_campanha', {
    p_contato_campanha_id: contatoCampanhaId,
    p_status: status,
    p_mensagem_id: extra.mensagemId ?? null,
    p_conversa_id: extra.conversaId ?? null,
    p_erro: extra.erro ?? null,
    p_motivo_ignorado: extra.motivo ?? null,
  });

  if (error) {
    log.error('Falha ao concluir destinatário de campanha', { erro: error.message });
  }
}

async function contarEnviosDeHoje(trabalho: TrabalhoCampanha, fuso: string): Promise<number> {
  const agora = new Date();
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const hoje = formatador.format(agora);

  const { count } = await clienteAdministrador()
    .from('contatos_campanha')
    .select('id', { count: 'exact', head: true })
    .eq('campanha_id', trabalho.campanhaId)
    .eq('status', 'ENVIADO')
    .gte('enviado_em', `${hoje}T00:00:00`);

  return count ?? 0;
}

async function reagendar(trabalho: TrabalhoCampanha, atrasoMs: number): Promise<void> {
  // Primeiro o banco fica sabendo quando é a vez do próximo passo, no
  // relógio dele. Trabalho desta campanha que aparecer antes disso perde a
  // reivindicação e encerra — é o que mantém uma sequência só.
  const { error } = await clienteAdministrador().rpc('agendar_passo_campanha', {
    p_campanha_id: trabalho.campanhaId,
    p_atraso_ms: Math.round(atrasoMs),
  });

  if (error) throw new Error(`Falha ao agendar o próximo passo da campanha: ${error.message}`);

  await enfileirar(FILAS.campanhas, trabalho, {
    id: `campanha:${trabalho.campanhaId}:${Date.now()}`,
    atrasoMs,
  });
}
