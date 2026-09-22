/**
 * Tipos do banco.
 *
 * Escrito à mão em vez de gerado pelo CLI do Supabase de propósito: o
 * gerador precisa de um banco no ar, e este arquivo precisa existir antes
 * de qualquer banco existir — é ele que faz `npm run verificar` acusar uma
 * coluna escrita errado numa consulta em vez de o erro aparecer só em
 * produção.
 *
 * Ao mexer numa migração, ajuste aqui também. As duas coisas caminham
 * juntas e é a única disciplina que este arquivo exige.
 */

// ---------------------------------------------------------------------
// Enums (espelham os tipos criados nas migrações)
// ---------------------------------------------------------------------
export type PapelMembro = 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'ATENDENTE';
export type TipoCanal = 'WHATSAPP';
export type ProvedorMensageria = 'EVOLUTION' | 'META_CLOUD' | 'SIMULADO';
export type StatusCanal = 'DESCONECTADO' | 'CONECTANDO' | 'AGUARDANDO_QR' | 'CONECTADO' | 'ERRO';
export type TipoCampo =
  | 'TEXTO'
  | 'TEXTO_LONGO'
  | 'NUMERO'
  | 'MOEDA'
  | 'DATA'
  | 'SELECAO'
  | 'MULTISELECAO'
  | 'BOOLEANO'
  | 'TELEFONE'
  | 'EMAIL'
  | 'DOCUMENTO';
export type OrigemDado = 'IA' | 'ATENDENTE' | 'IMPORTACAO' | 'INTEGRACAO' | 'CONTATO';
export type TipoMemoria = 'FATO' | 'PREFERENCIA' | 'OBJECAO' | 'EVENTO' | 'RESTRICAO';
export type EstadoConversaBanco =
  | 'IA'
  | 'AGUARDANDO_HUMANO'
  | 'HUMANO'
  | 'AGUARDANDO_CLIENTE'
  | 'ENCERRADA';
export type DirecaoMensagem = 'ENTRADA' | 'SAIDA';
export type AutorMensagem = 'CONTATO' | 'IA' | 'ATENDENTE' | 'SISTEMA';
export type TipoMensagem =
  | 'TEXTO'
  | 'IMAGEM'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENTO'
  | 'STICKER'
  | 'LOCALIZACAO'
  | 'CONTATO'
  | 'SISTEMA';
export type StatusMensagem = 'PENDENTE' | 'ENFILEIRADA' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHOU';
export type StatusProcessamento = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHOU' | 'NAO_APLICAVEL';
export type TipoAgente = 'SDR' | 'TRIAGEM' | 'SUPORTE' | 'JURIDICO' | 'ADMINISTRATIVO' | 'GENERICO';
export type StatusVersaoIa = 'RASCUNHO' | 'EM_REVISAO' | 'PUBLICADA' | 'ARQUIVADA';
export type OrigemVersaoIa = 'HUMANO' | 'SUGESTAO_IA';
export type StatusExecucao = 'PENDENTE' | 'EXECUTANDO' | 'CONCLUIDA' | 'FALHOU';
export type StatusSugestao = 'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'APLICADA';
export type TipoSugestao =
  | 'INSTRUCAO'
  | 'BASE_CONHECIMENTO'
  | 'PERGUNTA'
  | 'CAMPO'
  | 'TRANSFERENCIA'
  | 'OBJECAO';
export type StatusCampanha =
  | 'RASCUNHO'
  | 'AGENDADA'
  | 'EM_EXECUCAO'
  | 'PAUSADA'
  | 'CONCLUIDA'
  | 'CANCELADA';
export type StatusContatoCampanha =
  | 'PENDENTE'
  | 'RESERVADO'
  | 'ENVIADO'
  | 'FALHOU'
  | 'IGNORADO'
  | 'RESPONDIDO';
export type OrigemContatosCampanha = 'MANUAL' | 'ETIQUETA' | 'FILTRO' | 'GOOGLE_SHEETS';
export type TipoIntegracao = 'GOOGLE_SHEETS';
export type StatusIntegracao = 'DESCONECTADA' | 'CONECTADA' | 'ERRO' | 'EXPIRADA';
export type StatusLinhaPlanilha = 'IMPORTADA' | 'IGNORADA' | 'FALHOU';
export type StatusEventoWebhook = 'RECEBIDO' | 'ENFILEIRADO' | 'PROCESSADO' | 'IGNORADO' | 'FALHOU';

/** JSON como o Postgres devolve. */
export type Json = string | number | boolean | null | { [chave: string]: Json } | Json[];

// ---------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------
export type Organizacao = {
  id: string;
  nome: string;
  apelido: string;
  documento: string | null;
  fuso_horario: string;
  plano: string;
  limites: Json;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  url_avatar: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type MembroOrganizacao = {
  escopo_conversas: 'PROPRIAS' | 'EQUIPE';
  pode_assumir: boolean;
  pode_transferir: boolean;
  id: string;
  organizacao_id: string;
  perfil_id: string;
  papel: PapelMembro;
  ativo: boolean;
  disponivel: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Departamento = {
  id: string;
  organizacao_id: string;
  nome: string;
  chave: string;
  descricao: string | null;
  cor: string;
  criterio_transferencia: string | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type MembroDepartamento = {
  organizacao_id: string;
  departamento_id: string;
  membro_id: string;
  criado_em: string;
};

export type Canal = {
  id: string;
  organizacao_id: string;
  nome: string;
  tipo: TipoCanal;
  provedor: ProvedorMensageria;
  departamento_id: string | null;
  telefone: string | null;
  identificador_externo: string;
  segredo_webhook: string;
  configuracao: Json;
  status: StatusCanal;
  ia_ativa: boolean;
  ultima_conexao_em: string | null;
  ultimo_erro: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Contato = {
  id: string;
  organizacao_id: string;
  telefone: string;
  nome: string | null;
  nome_perfil_whatsapp: string | null;
  email: string | null;
  documento: string | null;
  origem: string | null;
  responsavel_id: string | null;
  departamento_id: string | null;
  resumo: string | null;
  resumo_atualizado_em: string | null;
  observacoes: string | null;
  bloqueado: boolean;
  aceita_campanha: boolean;
  opt_out_em: string | null;
  opt_out_motivo: string | null;
  eh_cliente: boolean;
  ultima_interacao_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type CampoPersonalizado = {
  id: string;
  organizacao_id: string;
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes: Json;
  instrucao_ia: string | null;
  obrigatorio_para_qualificacao: boolean;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type ValorCampoContato = {
  organizacao_id: string;
  contato_id: string;
  campo_id: string;
  valor: string | null;
  origem: OrigemDado;
  atualizado_em: string;
};

export type Etiqueta = {
  id: string;
  organizacao_id: string;
  nome: string;
  cor: string;
  descricao: string | null;
  criado_em: string;
};

export type EtiquetaContato = {
  organizacao_id: string;
  contato_id: string;
  etiqueta_id: string;
  criado_em: string;
};

export type MemoriaContato = {
  id: string;
  organizacao_id: string;
  contato_id: string;
  tipo: TipoMemoria;
  chave: string;
  conteudo: string;
  confianca: number;
  origem: OrigemDado;
  mensagem_id: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Conversa = {
  id: string;
  organizacao_id: string;
  contato_id: string;
  canal_id: string;
  estado: EstadoConversaBanco;
  departamento_id: string | null;
  responsavel_id: string | null;
  campanha_id: string | null;
  assunto: string | null;
  prioridade: number;
  nao_lidas: number;
  versao: number;
  iniciada_em: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem_previa: string | null;
  primeira_resposta_em: string | null;
  primeira_resposta_humana_em: string | null;
  encerrada_em: string | null;
  encerrada_por: string | null;
  motivo_encerramento: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type Arquivo = {
  id: string;
  organizacao_id: string;
  contato_id: string | null;
  caminho: string | null;
  nome_arquivo: string | null;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  duracao_segundos: number | null;
  url_externa: string | null;
  transcricao: string | null;
  status_transcricao: StatusProcessamento;
  descricao_analise: string | null;
  status_analise: StatusProcessamento;
  erro_processamento: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type Mensagem = {
  id: string;
  organizacao_id: string;
  conversa_id: string;
  contato_id: string;
  canal_id: string;
  direcao: DirecaoMensagem;
  autor: AutorMensagem;
  autor_membro_id: string | null;
  tipo: TipoMensagem;
  conteudo: string | null;
  arquivo_id: string | null;
  identificador_externo: string | null;
  chave_idempotencia: string | null;
  status: StatusMensagem;
  erro: string | null;
  respondendo_id: string | null;
  campanha_id: string | null;
  metadados: Json;
  criado_em: string;
  enviado_em: string | null;
  /** Reserva do despacho em andamento. Vencida ou nula = livre para sair. */
  despacho_iniciado_em: string | null;
  despacho_incerto: boolean;
  despacho_reservado_ate: string | null;
  /**
   * Nome de quem assina a mensagem no WhatsApp (a IA ou o atendente que
   * respondeu), gravado no momento do envio. Nulo em mensagem de sistema
   * ou de campanha — essas saem sem prefixo de nome.
   */
  remetente_nome: string | null;
};

export type EtiquetaConversa = {
  organizacao_id: string;
  conversa_id: string;
  etiqueta_id: string;
  criado_em: string;
};

export type NotaInterna = {
  id: string;
  organizacao_id: string;
  conversa_id: string;
  autor_membro_id: string | null;
  conteudo: string;
  criado_em: string;
};

export type EventoConversa = {
  id: string;
  organizacao_id: string;
  conversa_id: string;
  tipo: string;
  estado_anterior: EstadoConversaBanco | null;
  estado_novo: EstadoConversaBanco | null;
  de_membro_id: string | null;
  para_membro_id: string | null;
  de_departamento_id: string | null;
  para_departamento_id: string | null;
  ator_membro_id: string | null;
  ator: AutorMensagem;
  motivo: string | null;
  metadados: Json;
  criado_em: string;
};

export type AgenteIa = {
  id: string;
  organizacao_id: string;
  nome: string;
  tipo: TipoAgente;
  descricao: string | null;
  ativo: boolean;
  padrao: boolean;
  provedor: string;
  modelo: string;
  temperatura: number;
  max_mensagens_seguidas: number;
  versao_publicada_id: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type VersaoAgenteIa = {
  id: string;
  organizacao_id: string;
  agente_id: string;
  versao: number;
  status: StatusVersaoIa;
  origem: OrigemVersaoIa;
  persona: string;
  /**
   * Nome que a IA usa para se apresentar ao cliente (ex.: "Ana") — abre
   * cada mensagem dela no WhatsApp. Diferente de `agentes_ia.nome`, que é
   * só o rótulo interno do agente na tela de configuração.
   */
  nome_exibicao: string | null;
  tom: string;
  descricao_empresa: string;
  servicos: string;
  base_conhecimento: string;
  objetivos: string;
  regras: string;
  limitacoes: string;
  informacoes_proibidas: string;
  mensagem_fallback: string;
  /**
   * Texto fixo da primeira resposta da conversa — enviado sem chamar o
   * modelo, como um bot de saudação. Em branco, a primeira resposta
   * também é gerada pela IA normalmente.
   */
  primeira_mensagem: string;
  perguntas: Json;
  campos_obrigatorios: Json;
  criterios_transferencia: Json;
  horarios: Json;
  notas_da_versao: string | null;
  criado_por: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  publicado_em: string | null;
  substitui_versao_id: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type InteracaoIa = {
  id: string;
  organizacao_id: string;
  conversa_id: string | null;
  mensagem_id: string | null;
  agente_id: string | null;
  versao_id: string | null;
  finalidade: string;
  provedor: string;
  modelo: string;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  latencia_ms: number | null;
  sucesso: boolean;
  erro: string | null;
  criado_em: string;
};

export type ExecucaoAnaliseIa = {
  id: string;
  organizacao_id: string;
  agente_id: string | null;
  status: StatusExecucao;
  periodo_inicio: string;
  periodo_fim: string;
  total_conversas: number;
  total_mensagens: number;
  resumo: string | null;
  relatorio: Json;
  erro: string | null;
  iniciado_por: string | null;
  iniciado_em: string;
  concluido_em: string | null;
};

export type SugestaoIa = {
  id: string;
  organizacao_id: string;
  execucao_id: string | null;
  agente_id: string | null;
  tipo: TipoSugestao;
  titulo: string;
  descricao: string;
  evidencias: Json;
  ocorrencias: number;
  alteracao_proposta: Json;
  status: StatusSugestao;
  revisado_por: string | null;
  revisado_em: string | null;
  observacao_revisao: string | null;
  versao_gerada_id: string | null;
  criado_em: string;
};

export type Campanha = {
  id: string;
  organizacao_id: string;
  nome: string;
  descricao: string | null;
  canal_id: string;
  origem_contatos: OrigemContatosCampanha;
  filtro: Json;
  mensagem: string;
  variacoes: Json;
  intervalo_minimo_segundos: number;
  intervalo_maximo_segundos: number;
  janela_inicio: string;
  janela_fim: string;
  dias_semana: number[];
  limite_diario: number;
  ia_assume_resposta: boolean;
  departamento_id: string | null;
  status: StatusCampanha;
  agendada_para: string | null;
  /** Quando é a vez do próximo passo, no relógio do banco. Nulo = pode seguir já. */
  proximo_passo_em: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  total: number;
  processados: number;
  enviados: number;
  falhas: number;
  ignorados: number;
  respondidos: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type ContatoCampanha = {
  id: string;
  organizacao_id: string;
  campanha_id: string;
  contato_id: string;
  status: StatusContatoCampanha;
  mensagem_id: string | null;
  conversa_id: string | null;
  variacao_usada: number | null;
  tentativas: number;
  erro: string | null;
  motivo_ignorado: string | null;
  reservado_em: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
  criado_em: string;
};

export type Integracao = {
  id: string;
  organizacao_id: string;
  tipo: TipoIntegracao;
  nome: string;
  status: StatusIntegracao;
  credenciais: Json;
  configuracao: Json;
  conta_externa: string | null;
  ultimo_erro: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

/**
 * A view `integracoes_visiveis`. Escrita por extenso em vez de
 * `Omit<Integracao, 'credenciais'> & {...}`: interseção não recebe
 * assinatura de índice implícita, e o cliente do Supabase precisa dela
 * para tipar a consulta.
 */
export type IntegracaoVisivel = {
  id: string;
  organizacao_id: string;
  tipo: TipoIntegracao;
  nome: string;
  status: StatusIntegracao;
  configuracao: Json;
  conta_externa: string | null;
  ultimo_erro: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  possui_credenciais: boolean;
};

export type IntegracaoGoogleSheets = {
  id: string;
  organizacao_id: string;
  integracao_id: string;
  planilha_id: string;
  nome_planilha: string | null;
  aba: string;
  intervalo: string;
  coluna_identificadora: string | null;
  mapeamento_colunas: Json;
  primeira_linha_dados: number;
  intervalo_minutos: number;
  etiqueta_id: string | null;
  campanha_id: string | null;
  criar_conversa: boolean;
  ativo: boolean;
  ultima_sincronizacao_em: string | null;
  ultimo_erro: string | null;
  total_importados: number;
  criado_em: string;
  atualizado_em: string;
};

export type LinhaPlanilhaProcessada = {
  id: string;
  organizacao_id: string;
  integracao_sheets_id: string;
  identificador_linha: string;
  hash_conteudo: string;
  contato_id: string | null;
  status: StatusLinhaPlanilha;
  erro: string | null;
  criado_em: string;
};

export type EventoWebhook = {
  id: string;
  organizacao_id: string | null;
  canal_id: string | null;
  provedor: string;
  tipo_evento: string;
  identificador_externo: string;
  instancia: string | null;
  carga: Json;
  status: StatusEventoWebhook;
  tentativas: number;
  erro: string | null;
  recebido_em: string;
  processado_em: string | null;
};

export type FalhaTrabalho = {
  id: string;
  organizacao_id: string | null;
  fila: string;
  nome_trabalho: string;
  identificador_trabalho: string | null;
  dados: Json;
  erro: string;
  tentativas: number;
  resolvido: boolean;
  criado_em: string;
};

export type RegistroAuditoria = {
  id: string;
  organizacao_id: string | null;
  ator_perfil_id: string | null;
  ator_email: string | null;
  ator_tipo: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  metadados: Json;
  endereco_ip: string | null;
  agente_usuario: string | null;
  criado_em: string;
};

export type Convite = {
  id: string;
  organizacao_id: string;
  email: string;
  papel: PapelMembro;
  departamentos: string[];
  token: string;
  expira_em: string;
  aceito_em: string | null;
  criado_por: string | null;
  criado_em: string;
};

// ---------------------------------------------------------------------
// Formato esperado pelo cliente do Supabase
// ---------------------------------------------------------------------
type Tabela<L> = {
  Row: L;
  Insert: Partial<L>;
  Update: Partial<L>;
  Relationships: [];
};

type Visao<L> = { Row: L; Relationships: [] };

export type BancoDados = {
  public: {
    Tables: {
      regras_atendimento: Tabela<import('./operacao/tipos').RegraAtendimento>;
      retornos: Tabela<import('./operacao/tipos').Retorno>;
      respostas_rapidas: Tabela<import('./operacao/tipos').RespostaRapida>;
      organizacoes: Tabela<Organizacao>;
      perfis: Tabela<Perfil>;
      membros_organizacao: Tabela<MembroOrganizacao>;
      departamentos: Tabela<Departamento>;
      membros_departamento: Tabela<MembroDepartamento>;
      canais: Tabela<Canal>;
      contatos: Tabela<Contato>;
      campos_personalizados: Tabela<CampoPersonalizado>;
      valores_campos_contato: Tabela<ValorCampoContato>;
      etiquetas: Tabela<Etiqueta>;
      etiquetas_contato: Tabela<EtiquetaContato>;
      memorias_contato: Tabela<MemoriaContato>;
      conversas: Tabela<Conversa>;
      arquivos: Tabela<Arquivo>;
      mensagens: Tabela<Mensagem>;
      etiquetas_conversa: Tabela<EtiquetaConversa>;
      notas_internas: Tabela<NotaInterna>;
      eventos_conversa: Tabela<EventoConversa>;
      agentes_ia: Tabela<AgenteIa>;
      versoes_agente_ia: Tabela<VersaoAgenteIa>;
      interacoes_ia: Tabela<InteracaoIa>;
      execucoes_analise_ia: Tabela<ExecucaoAnaliseIa>;
      sugestoes_ia: Tabela<SugestaoIa>;
      campanhas: Tabela<Campanha>;
      contatos_campanha: Tabela<ContatoCampanha>;
      integracoes: Tabela<Integracao>;
      integracoes_google_sheets: Tabela<IntegracaoGoogleSheets>;
      linhas_planilha_processadas: Tabela<LinhaPlanilhaProcessada>;
      eventos_webhook: Tabela<EventoWebhook>;
      falhas_trabalho: Tabela<FalhaTrabalho>;
      registros_auditoria: Tabela<RegistroAuditoria>;
      convites: Tabela<Convite>;
    };
    Views: {
      contatos_operacionais: Visao<Contato & { conversa_id: string | null; canal_nome: string | null; equipe_nome: string | null; responsavel_nome: string | null; ultimo_autor: string | null; para_responder: boolean | null; retorno_vencido: boolean | null; sugestao_retorno: boolean | null; com_ia: boolean | null; sem_responsavel: boolean | null; retorno_prazo: string | null; etiquetas: Json; conversas_abertas: number; interacao_operacional_em: string | null; ultimo_autor_membro: string | null }>;
      historico_atendimento: Visao<{ id: string; organizacao_id: string; conversa_id: string; ocorrido_em: string; tipo: string; autor: string; conteudo: string | null; autor_membro_id: string | null }>;
      fila_operacional: Visao<import('./operacao/tipos').FilaOperacional>;
      integracoes_visiveis: Visao<IntegracaoVisivel>;
    };
    Functions: {
      reabrir_ao_receber: { Args: { p_contato: string; p_canal: string; p_org: string }; Returns: Conversa[] };
      salvar_acesso_operacional: { Args: { p_membro: string; p_papel: PapelMembro; p_equipes: string[]; p_escopo: string; p_assumir: boolean; p_transferir: boolean }; Returns: undefined };
      saude_canais: { Args: Record<string, never>; Returns: Json };
      resolver_despacho: { Args: { p_mensagem: string; p_entregue: boolean }; Returns: undefined };
      transferir_com_nota: { Args: { p_conversa: string; p_equipe: string | null; p_membro: string | null; p_ator: string; p_motivo: string | null; p_nota: string | null }; Returns: boolean };
      iniciar_despacho: { Args: { p_mensagem: string; p_org: string }; Returns: boolean };
      atualizar_conversa_recebida: { Args: { p_conversa: string; p_org: string; p_previa: string; p_recebido: string }; Returns: Conversa['estado'] };

      relatorio_atendimento: { Args: { p_inicio: string; p_fim: string; p_equipe?: string | null; p_canal?: string | null }; Returns: Json };
      carga_consultores: { Args: { p_equipe?: string | null; p_canal?: string | null }; Returns: Json };
      fila_contagens: { Args: { p_busca?: string; p_equipe?: string | null; p_responsavel?: string | null; p_canal?: string | null }; Returns: Json };
      atendimento_contagens: { Args: { p_membro: string; p_busca?: string; p_equipe?: string | null; p_canal?: string | null }; Returns: Json };
      assumir_conversa: {
        Args: { p_conversa_id: string; p_membro_id: string; p_motivo?: string | null };
        Returns: boolean;
      };
      devolver_conversa_para_ia: {
        Args: { p_conversa_id: string; p_membro_id: string; p_motivo?: string | null };
        Returns: boolean;
      };
      registrar_mensagem_ia: {
        Args: {
          p_conversa_id: string;
          p_conteudo: string;
          p_chave_idempotencia: string;
          p_metadados?: Json;
          p_remetente_nome?: string | null;
        };
        Returns: string | null;
      };
      transferir_conversa: {
        Args: {
          p_conversa_id: string;
          p_departamento_id: string | null;
          p_membro_id: string | null;
          p_ator_membro_id: string | null;
          p_ator?: AutorMensagem;
          p_motivo?: string | null;
        };
        Returns: boolean;
      };
      encerrar_conversa: {
        Args: { p_conversa_id: string; p_membro_id: string; p_motivo?: string | null };
        Returns: boolean;
      };
      encerrar_conversa_com_versao: {
        Args: { p_conversa_id: string; p_membro_id: string; p_versao: number; p_motivo?: string | null };
        Returns: boolean;
      };
      reabrir_conversa: {
        Args: { p_conversa_id: string; p_membro_id: string; p_para_ia?: boolean };
        Returns: boolean;
      };
      publicar_versao_ia: {
        Args: { p_versao_id: string; p_membro_id: string };
        Returns: boolean;
      };
      proxima_versao_agente: { Args: { p_agente_id: string }; Returns: number };
      reservar_contato_campanha: { Args: { p_campanha_id: string }; Returns: string | null };
      reservar_despacho_mensagem: {
        Args: { p_mensagem_id: string; p_organizacao_id: string; p_segundos?: number };
        Returns: Mensagem[];
      };
      reivindicar_passo_campanha: {
        Args: { p_campanha_id: string; p_prazo_segundos?: number; p_tolerancia_segundos?: number };
        Returns: boolean;
      };
      agendar_passo_campanha: {
        Args: { p_campanha_id: string; p_atraso_ms: number };
        Returns: undefined;
      };
      concluir_contato_campanha: {
        Args: {
          p_contato_campanha_id: string;
          p_status: StatusContatoCampanha;
          p_mensagem_id?: string | null;
          p_conversa_id?: string | null;
          p_erro?: string | null;
          p_motivo_ignorado?: string | null;
        };
        Returns: undefined;
      };
      registrar_resposta_campanha: {
        Args: { p_conversa_id: string; p_contato_id: string };
        Returns: undefined;
      };
      criar_organizacao_inicial: {
        Args: { p_nome: string; p_apelido: string; p_modelo?: string };
        Returns: string;
      };
      aceitar_convite: { Args: { p_token: string }; Returns: string };
      indicadores_painel: {
        Args: { p_organizacao_id: string; p_inicio: string; p_fim: string };
        Returns: Json;
      };
      contagens_caixas: { Args: { p_organizacao_id: string }; Returns: Json };
      url_webhook_do_canal: { Args: { p_canal_id: string; p_base: string }; Returns: string };
      girar_segredo_webhook: { Args: { p_canal_id: string }; Returns: string };
      limpar_eventos_webhook_antigos: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      papel_membro: PapelMembro;
      estado_conversa: EstadoConversaBanco;
      status_campanha: StatusCampanha;
    };
    CompositeTypes: Record<string, never>;
  };
};
