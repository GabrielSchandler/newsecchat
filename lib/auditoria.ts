/**
 * Registro de auditoria.
 *
 * Grava com a chave de serviço de propósito: a política de RLS de
 * `registros_auditoria` só permite LEITURA ao gestor, e nenhum INSERT
 * vindo do navegador. Log que o próprio usuário pode escrever ou apagar
 * não serve como auditoria.
 *
 * Nunca derruba a operação: se a auditoria falhar, o atendimento continua
 * e a falha vira linha de log de erro.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { log } from '@/lib/log';
import type { Json } from '@/lib/tipos-banco';

export const ACOES = {
  ENTRAR: 'ENTRAR',
  SAIR: 'SAIR',
  ORGANIZACAO_CRIADA: 'ORGANIZACAO_CRIADA',
  ORGANIZACAO_ATUALIZADA: 'ORGANIZACAO_ATUALIZADA',

  USUARIO_CONVIDADO: 'USUARIO_CONVIDADO',
  USUARIO_PAPEL_ALTERADO: 'USUARIO_PAPEL_ALTERADO',
  USUARIO_DESATIVADO: 'USUARIO_DESATIVADO',
  USUARIO_REATIVADO: 'USUARIO_REATIVADO',

  DEPARTAMENTO_CRIADO: 'DEPARTAMENTO_CRIADO',
  DEPARTAMENTO_ATUALIZADO: 'DEPARTAMENTO_ATUALIZADO',
  DEPARTAMENTO_REMOVIDO: 'DEPARTAMENTO_REMOVIDO',

  CANAL_CRIADO: 'CANAL_CRIADO',
  CANAL_CONECTADO: 'CANAL_CONECTADO',
  CANAL_DESCONECTADO: 'CANAL_DESCONECTADO',
  CANAL_REMOVIDO: 'CANAL_REMOVIDO',
  CANAL_ATUALIZADO: 'CANAL_ATUALIZADO',

  CONVERSA_ASSUMIDA: 'CONVERSA_ASSUMIDA',
  CONVERSA_TRANSFERIDA: 'CONVERSA_TRANSFERIDA',
  CONVERSA_ENCERRADA: 'CONVERSA_ENCERRADA',
  CONVERSA_REABERTA: 'CONVERSA_REABERTA',
  CONVERSA_DEVOLVIDA_IA: 'CONVERSA_DEVOLVIDA_IA',
  MENSAGEM_ENVIADA: 'MENSAGEM_ENVIADA',

  CONTATO_ATUALIZADO: 'CONTATO_ATUALIZADO',
  CONTATO_OPT_OUT: 'CONTATO_OPT_OUT',

  IA_VERSAO_CRIADA: 'IA_VERSAO_CRIADA',
  IA_VERSAO_PUBLICADA: 'IA_VERSAO_PUBLICADA',
  IA_SUGESTAO_APROVADA: 'IA_SUGESTAO_APROVADA',
  IA_SUGESTAO_REJEITADA: 'IA_SUGESTAO_REJEITADA',
  IA_ANALISE_INICIADA: 'IA_ANALISE_INICIADA',
  IA_AGENTE_ATUALIZADO: 'IA_AGENTE_ATUALIZADO',

  CAMPANHA_CRIADA: 'CAMPANHA_CRIADA',
  CAMPANHA_INICIADA: 'CAMPANHA_INICIADA',
  CAMPANHA_PAUSADA: 'CAMPANHA_PAUSADA',
  CAMPANHA_RETOMADA: 'CAMPANHA_RETOMADA',
  CAMPANHA_CANCELADA: 'CAMPANHA_CANCELADA',
  CAMPANHA_CONTATOS_ADICIONADOS: 'CAMPANHA_CONTATOS_ADICIONADOS',

  INTEGRACAO_CONECTADA: 'INTEGRACAO_CONECTADA',
  INTEGRACAO_DESCONECTADA: 'INTEGRACAO_DESCONECTADA',
  PLANILHA_SINCRONIZADA: 'PLANILHA_SINCRONIZADA',

  CAMPO_CRIADO: 'CAMPO_CRIADO',
  CAMPO_ATUALIZADO: 'CAMPO_ATUALIZADO',
} as const;

export type AcaoAuditoria = (typeof ACOES)[keyof typeof ACOES];

export interface EntradaAuditoria {
  organizacaoId: string | null;
  acao: AcaoAuditoria;
  atorPerfilId?: string | null;
  atorEmail?: string | null;
  atorTipo?: 'USUARIO' | 'SISTEMA' | 'IA';
  entidade?: string | null;
  entidadeId?: string | null;
  metadados?: Record<string, unknown>;
  enderecoIp?: string | null;
  agenteUsuario?: string | null;
}

export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    const { error } = await clienteAdministrador()
      .from('registros_auditoria')
      .insert({
        organizacao_id: entrada.organizacaoId,
        ator_perfil_id: entrada.atorPerfilId ?? null,
        ator_email: entrada.atorEmail ?? null,
        ator_tipo: entrada.atorTipo ?? 'USUARIO',
        acao: entrada.acao,
        entidade: entrada.entidade ?? null,
        entidade_id: entrada.entidadeId ?? null,
        metadados: (entrada.metadados ?? {}) as Json,
        endereco_ip: entrada.enderecoIp ?? null,
        agente_usuario: entrada.agenteUsuario ?? null,
      });

    if (error) throw new Error(error.message);
  } catch (erro) {
    // Auditoria que derruba o atendimento é pior que auditoria com furo.
    log.error('Falha ao gravar auditoria', {
      organizacao_id: entrada.organizacaoId,
      acao: entrada.acao,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
  }
}

/** Descrição legível para a tela de auditoria. */
export const descricaoAcao: Record<string, string> = {
  ENTRAR: 'Entrou no sistema',
  SAIR: 'Saiu do sistema',
  ORGANIZACAO_CRIADA: 'Criou a organização',
  ORGANIZACAO_ATUALIZADA: 'Alterou dados da organização',
  USUARIO_CONVIDADO: 'Convidou um usuário',
  USUARIO_PAPEL_ALTERADO: 'Alterou o papel de um usuário',
  USUARIO_DESATIVADO: 'Desativou um usuário',
  USUARIO_REATIVADO: 'Reativou um usuário',
  DEPARTAMENTO_CRIADO: 'Criou um departamento',
  DEPARTAMENTO_ATUALIZADO: 'Alterou um departamento',
  DEPARTAMENTO_REMOVIDO: 'Removeu um departamento',
  CANAL_CRIADO: 'Cadastrou um canal de WhatsApp',
  CANAL_CONECTADO: 'Conectou um canal',
  CANAL_DESCONECTADO: 'Desconectou um canal',
  CANAL_REMOVIDO: 'Removeu um canal',
  CANAL_ATUALIZADO: 'Alterou um canal',
  CONVERSA_ASSUMIDA: 'Assumiu uma conversa',
  CONVERSA_TRANSFERIDA: 'Transferiu uma conversa',
  CONVERSA_ENCERRADA: 'Encerrou uma conversa',
  CONVERSA_REABERTA: 'Reabriu uma conversa',
  CONVERSA_DEVOLVIDA_IA: 'Devolveu a conversa para a IA',
  MENSAGEM_ENVIADA: 'Enviou uma mensagem',
  CONTATO_ATUALIZADO: 'Alterou um contato',
  CONTATO_OPT_OUT: 'Registrou saída de campanhas',
  IA_VERSAO_CRIADA: 'Criou uma versão da IA',
  IA_VERSAO_PUBLICADA: 'Publicou uma versão da IA',
  IA_SUGESTAO_APROVADA: 'Aprovou uma sugestão da IA',
  IA_SUGESTAO_REJEITADA: 'Rejeitou uma sugestão da IA',
  IA_ANALISE_INICIADA: 'Iniciou a análise de atendimentos',
  IA_AGENTE_ATUALIZADO: 'Alterou o agente de IA',
  CAMPANHA_CRIADA: 'Criou uma campanha',
  CAMPANHA_INICIADA: 'Iniciou uma campanha',
  CAMPANHA_PAUSADA: 'Pausou uma campanha',
  CAMPANHA_RETOMADA: 'Retomou uma campanha',
  CAMPANHA_CANCELADA: 'Cancelou uma campanha',
  CAMPANHA_CONTATOS_ADICIONADOS: 'Adicionou contatos a uma campanha',
  INTEGRACAO_CONECTADA: 'Conectou uma integração',
  INTEGRACAO_DESCONECTADA: 'Desconectou uma integração',
  PLANILHA_SINCRONIZADA: 'Sincronizou uma planilha',
  CAMPO_CRIADO: 'Criou um campo personalizado',
  CAMPO_ATUALIZADO: 'Alterou um campo personalizado',
};
