'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { exigirPapel } from '@/lib/sessao';
import { obterProvedorMensageria } from '@/lib/provedores/mensageria/indice';
import { ErroProvedorMensageria } from '@/lib/provedores/mensageria/contrato';
import { ambientePublico, ErroConfiguracao, integracaoConfigurada } from '@/lib/ambiente';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import { gerarApelido } from '@/lib/utilitarios';
import { log } from '@/lib/log';
import type { ProvedorMensageria as NomeProvedor, StatusCanal } from '@/lib/tipos-banco';

export interface ResultadoCanal {
  ok: boolean;
  erro?: string;
  qrCodeBase64?: string | null;
  codigo?: string | null;
  status?: StatusCanal;
  url?: string;
}

const uuid = z.string().uuid();

/** Traduz a exceção do provedor num texto que o dono entende. */
function traduzir(erro: unknown): string {
  if (erro instanceof ErroConfiguracao) return erro.message;

  if (erro instanceof ErroProvedorMensageria) {
    if (erro.statusHttp === 401 || erro.statusHttp === 403) {
      return 'A Evolution API recusou a chave. Confira EVOLUTION_API_KEY no .env.local.';
    }
    if (erro.statusHttp === 404) {
      return 'A Evolution API não encontrou esta instância. Tente remover e cadastrar o canal de novo.';
    }
    return erro.message;
  }

  return erro instanceof Error ? erro.message : 'Falha inesperada.';
}

const esquemaCriacao = z.object({
  nome: z.string().trim().min(2, 'Dê um nome ao canal').max(80),
  departamentoId: z.string().uuid().nullable(),
  provedor: z.enum(['EVOLUTION', 'SIMULADO']),
  iaAtiva: z.boolean(),
});

export async function criarCanal(entrada: {
  nome: string;
  departamentoId: string | null;
  provedor: NomeProvedor;
  iaAtiva: boolean;
}): Promise<ResultadoCanal> {
  const conferido = esquemaCriacao.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  if (conferido.data.provedor === 'EVOLUTION' && !integracaoConfigurada('EVOLUTION')) {
    return {
      ok: false,
      erro: 'A Evolution API ainda não está configurada. Preencha EVOLUTION_API_URL e EVOLUTION_API_KEY no .env.local — passo a passo em OWNER_SETUP_GUIDE.md, seção EVOLUTION API.',
    };
  }

  // O identificador precisa ser único no banco inteiro (é o que o webhook
  // usa para achar o canal). O sufixo aleatório evita colisão entre duas
  // empresas que deem o mesmo nome ao canal.
  const base = `${gerarApelido(sessao.organizacao.apelido)}-${gerarApelido(conferido.data.nome)}`;
  const identificador = `${base.slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: canal, error } = await supabase
    .from('canais')
    .insert({
      organizacao_id: sessao.organizacao.id,
      nome: conferido.data.nome,
      provedor: conferido.data.provedor,
      departamento_id: conferido.data.departamentoId,
      identificador_externo: identificador,
      ia_ativa: conferido.data.iaAtiva,
      status: 'DESCONECTADO',
    })
    .select('id')
    .single();

  if (error) {
    log.error('Falha ao criar canal', { erro: error.message });
    return { ok: false, erro: 'Não foi possível cadastrar o canal.' };
  }

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CANAL_CRIADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'canais',
    entidadeId: canal.id,
    metadados: { nome: conferido.data.nome, provedor: conferido.data.provedor },
  });

  revalidatePath('/configuracoes/canais');
  return { ok: true };
}

/**
 * Prepara a instância no provedor e devolve o QR Code.
 *
 * Usa a chave de serviço porque precisa do segredo do webhook, que a
 * migração 0011 tirou do alcance de quem não é gestor. O papel já foi
 * conferido logo acima — a chave de serviço aqui é meio, não permissão.
 */
export async function conectarCanal(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  const sessao = await exigirPapel('ADMIN');
  const admin = clienteAdministrador();

  const { data: canal } = await admin
    .from('canais')
    .select('*')
    .eq('id', canalId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!canal) return { ok: false, erro: 'Canal não encontrado' };

  const urlWebhook = `${ambientePublico.urlAplicacao.replace(/\/+$/, '')}/api/webhooks/evolution/${canal.segredo_webhook}`;

  try {
    const provedor = obterProvedorMensageria(canal.provedor);
    const referencia = {
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      identificador_externo: canal.identificador_externo,
    };

    await provedor.provisionar(referencia, urlWebhook);
    const conexao = await provedor.conectar(referencia);

    const configuracaoAtual =
      canal.configuracao && typeof canal.configuracao === 'object' && !Array.isArray(canal.configuracao)
        ? canal.configuracao
        : {};

    await admin
      .from('canais')
      .update({
        status: conexao.status,
        ultimo_erro: null,
        configuracao: {
          ...configuracaoAtual,
          qrcode: conexao.qrCodeBase64 ?? null,
          qrcode_em: conexao.qrCodeBase64 ? new Date().toISOString() : null,
        },
        ultima_conexao_em: conexao.status === 'CONECTADO' ? new Date().toISOString() : canal.ultima_conexao_em,
      })
      .eq('id', canal.id);

    await registrarAuditoria({
      organizacaoId: sessao.organizacao.id,
      acao: ACOES.CANAL_CONECTADO,
      atorPerfilId: sessao.perfil.id,
      atorEmail: sessao.perfil.email,
      entidade: 'canais',
      entidadeId: canal.id,
    });

    revalidatePath('/configuracoes/canais');

    return {
      ok: true,
      qrCodeBase64: conexao.qrCodeBase64 ?? null,
      codigo: conexao.codigo ?? null,
      status: conexao.status,
    };
  } catch (erro) {
    const mensagem = traduzir(erro);
    await admin.from('canais').update({ status: 'ERRO', ultimo_erro: mensagem }).eq('id', canal.id);
    revalidatePath('/configuracoes/canais');
    return { ok: false, erro: mensagem };
  }
}

export async function conferirStatusCanal(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  const sessao = await exigirPapel('ADMIN');
  const admin = clienteAdministrador();

  const { data: canal } = await admin
    .from('canais')
    .select('*')
    .eq('id', canalId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!canal) return { ok: false, erro: 'Canal não encontrado' };

  try {
    const provedor = obterProvedorMensageria(canal.provedor);
    const situacao = await provedor.statusConexao({
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      identificador_externo: canal.identificador_externo,
    });

    await admin
      .from('canais')
      .update({
        status: situacao.status,
        ultimo_erro: null,
        ultima_conexao_em:
          situacao.status === 'CONECTADO' ? new Date().toISOString() : canal.ultima_conexao_em,
      })
      .eq('id', canal.id);

    revalidatePath('/configuracoes/canais');
    return { ok: true, status: situacao.status };
  } catch (erro) {
    return { ok: false, erro: traduzir(erro) };
  }
}

export async function desconectarCanal(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  const sessao = await exigirPapel('ADMIN');
  const admin = clienteAdministrador();

  const { data: canal } = await admin
    .from('canais')
    .select('*')
    .eq('id', canalId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!canal) return { ok: false, erro: 'Canal não encontrado' };

  try {
    await obterProvedorMensageria(canal.provedor).desconectar({
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      identificador_externo: canal.identificador_externo,
    });
  } catch (erro) {
    // Desconectar é operação de limpeza: se o provedor não responde, o
    // canal ainda precisa ficar marcado como desconectado por aqui.
    log.warn('Provedor não confirmou a desconexão', { erro: traduzir(erro) });
  }

  await admin
    .from('canais')
    .update({ status: 'DESCONECTADO', configuracao: {} })
    .eq('id', canal.id);

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CANAL_DESCONECTADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'canais',
    entidadeId: canal.id,
  });

  revalidatePath('/configuracoes/canais');
  return { ok: true, status: 'DESCONECTADO' };
}

const esquemaAtualizacao = z.object({
  canalId: uuid,
  nome: z.string().trim().min(2).max(80),
  departamentoId: z.string().uuid().nullable(),
  iaAtiva: z.boolean(),
  ativo: z.boolean(),
});

export async function atualizarCanal(entrada: {
  canalId: string;
  nome: string;
  departamentoId: string | null;
  iaAtiva: boolean;
  ativo: boolean;
}): Promise<ResultadoCanal> {
  const conferido = esquemaAtualizacao.safeParse(entrada);
  if (!conferido.success) {
    return { ok: false, erro: conferido.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('canais')
    .update({
      nome: conferido.data.nome,
      departamento_id: conferido.data.departamentoId,
      ia_ativa: conferido.data.iaAtiva,
      ativo: conferido.data.ativo,
    })
    .eq('id', conferido.data.canalId)
    .eq('organizacao_id', sessao.organizacao.id);

  if (error) return { ok: false, erro: 'Não foi possível salvar as alterações.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CANAL_ATUALIZADO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'canais',
    entidadeId: conferido.data.canalId,
    metadados: { ia_ativa: conferido.data.iaAtiva, ativo: conferido.data.ativo },
  });

  revalidatePath('/configuracoes/canais');
  return { ok: true };
}

export async function removerCanal(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  const sessao = await exigirPapel('ADMIN');
  const admin = clienteAdministrador();

  const { data: canal } = await admin
    .from('canais')
    .select('*')
    .eq('id', canalId)
    .eq('organizacao_id', sessao.organizacao.id)
    .maybeSingle();

  if (!canal) return { ok: false, erro: 'Canal não encontrado' };

  const { count } = await admin
    .from('conversas')
    .select('id', { count: 'exact', head: true })
    .eq('canal_id', canalId)
    .neq('estado', 'ENCERRADA');

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: `Este canal tem ${count} conversa(s) em aberto. Encerre ou transfira antes de remover — apagar o canal apagaria o histórico junto.`,
    };
  }

  try {
    await obterProvedorMensageria(canal.provedor).remover({
      id: canal.id,
      organizacao_id: canal.organizacao_id,
      identificador_externo: canal.identificador_externo,
    });
  } catch (erro) {
    log.warn('Provedor não confirmou a remoção da instância', { erro: traduzir(erro) });
  }

  const { error } = await admin.from('canais').delete().eq('id', canalId);
  if (error) return { ok: false, erro: 'Não foi possível remover o canal.' };

  await registrarAuditoria({
    organizacaoId: sessao.organizacao.id,
    acao: ACOES.CANAL_REMOVIDO,
    atorPerfilId: sessao.perfil.id,
    atorEmail: sessao.perfil.email,
    entidade: 'canais',
    entidadeId: canalId,
    metadados: { nome: canal.nome },
  });

  revalidatePath('/configuracoes/canais');
  return { ok: true };
}

export async function obterUrlWebhook(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { data, error } = await supabase.rpc('url_webhook_do_canal', {
    p_canal_id: canalId,
    p_base: ambientePublico.urlAplicacao,
  });

  if (error || !data) {
    return { ok: false, erro: 'Não foi possível obter o endereço do webhook.' };
  }

  return { ok: true, url: data };
}

export async function girarSegredoWebhook(canalId: string): Promise<ResultadoCanal> {
  if (!uuid.safeParse(canalId).success) return { ok: false, erro: 'Canal inválido' };

  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const { error } = await supabase.rpc('girar_segredo_webhook', { p_canal_id: canalId });
  if (error) return { ok: false, erro: 'Não foi possível gerar um segredo novo.' };

  // O endereço mudou: sem reconfigurar, a Evolution segue chamando o
  // antigo e as mensagens param de chegar.
  const resultado = await conectarCanal(canalId);

  revalidatePath('/configuracoes/canais');

  if (!resultado.ok) {
    return {
      ok: false,
      erro: `O segredo foi trocado, mas não foi possível avisar a Evolution API: ${resultado.erro}. Clique em Conectar para reconfigurar.`,
    };
  }

  log.info('Segredo do webhook trocado', {
    organizacao_id: sessao.organizacao.id,
    canal_id: canalId,
  });

  return { ok: true };
}
