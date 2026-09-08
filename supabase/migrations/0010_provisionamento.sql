-- =====================================================================
-- 0010 — Provisionamento da organização
--
-- Primeira entrada de quem acabou de criar a conta: uma chamada monta a
-- organização, o vínculo do dono, os departamentos, o agente de IA com a
-- versão 1 já publicada e, opcionalmente, um conjunto de campos
-- personalizados de partida.
--
-- Os departamentos e campos criados aqui são PONTO DE PARTIDA, não
-- catálogo fechado: tudo é editável na tela de configurações depois.
-- =====================================================================

create or replace function criar_organizacao_inicial(
  p_nome text,
  p_apelido text,
  p_modelo text default 'GENERICO'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_usuario uuid := auth.uid();
  v_organizacao_id uuid;
  v_membro_id uuid;
  v_agente_id uuid;
  v_versao_id uuid;
begin
  if v_usuario is null then
    raise exception 'É preciso estar autenticado';
  end if;

  -- Uma organização por usuário nesta porta de entrada. Quem precisa de
  -- uma segunda entra por convite, que é o caminho auditado.
  if exists (select 1 from membros_organizacao where perfil_id = v_usuario) then
    raise exception 'Este usuário já pertence a uma organização';
  end if;

  insert into organizacoes (nome, apelido)
  values (p_nome, p_apelido)
  returning id into v_organizacao_id;

  insert into membros_organizacao (organizacao_id, perfil_id, papel)
  values (v_organizacao_id, v_usuario, 'SUPER_ADMIN')
  returning id into v_membro_id;

  -- Departamentos de partida
  insert into departamentos (organizacao_id, nome, chave, descricao, criterio_transferencia, cor, ordem)
  values
    (v_organizacao_id, 'Comercial', 'comercial',
     'Vendas, propostas e negociação com quem ainda não é cliente.',
     'Interesse em contratar, dúvida sobre preço, condições ou prazo.', '#0f766e', 1),
    (v_organizacao_id, 'Jurídico', 'juridico',
     'Assuntos de processo e questões jurídicas de quem já é cliente.',
     'Pergunta sobre andamento de processo, prazo judicial ou documento processual.', '#b5121a', 2),
    (v_organizacao_id, 'Administrativo', 'administrativo',
     'Documentação, cadastro, cobrança e suporte administrativo.',
     'Envio de documento, atualização de cadastro, boleto, pagamento.', '#3a3e48', 3);

  -- Etiquetas de partida
  insert into etiquetas (organizacao_id, nome, cor) values
    (v_organizacao_id, 'Lead novo', '#0f766e'),
    (v_organizacao_id, 'Qualificado', '#15803d'),
    (v_organizacao_id, 'Sem interesse', '#7b8393'),
    (v_organizacao_id, 'Retornar depois', '#d97706');

  -- Campos personalizados conforme o modelo escolhido
  if p_modelo = 'SERVICOS_FINANCEIROS' then
    insert into campos_personalizados
      (organizacao_id, chave, rotulo, tipo, instrucao_ia, obrigatorio_para_qualificacao, ordem, opcoes)
    values
      (v_organizacao_id, 'instituicao', 'Instituição financeira', 'TEXTO',
       'Com qual banco ou financeira o contrato foi feito. Aceitar o nome como o cliente falar.', true, 1, '[]'::jsonb),
      (v_organizacao_id, 'tipo_contrato', 'Tipo de contrato', 'SELECAO',
       'Que tipo de contrato o cliente tem. Perguntar de forma aberta e encaixar na opção mais próxima.', true, 2,
       '["Veículo","Imóvel","Empréstimo pessoal","Consignado","Outro"]'::jsonb),
      (v_organizacao_id, 'valor_contrato', 'Valor do contrato', 'MOEDA',
       'Valor total financiado. Se o cliente não souber de cabeça, aceitar aproximado.', false, 3, '[]'::jsonb),
      (v_organizacao_id, 'valor_parcela', 'Valor da parcela', 'MOEDA',
       'Quanto o cliente paga por mês.', true, 4, '[]'::jsonb),
      (v_organizacao_id, 'parcelas_restantes', 'Parcelas restantes', 'NUMERO',
       'Quantas parcelas ainda faltam pagar.', false, 5, '[]'::jsonb);
  else
    insert into campos_personalizados
      (organizacao_id, chave, rotulo, tipo, instrucao_ia, obrigatorio_para_qualificacao, ordem, opcoes)
    values
      (v_organizacao_id, 'necessidade', 'O que o cliente precisa', 'TEXTO_LONGO',
       'Em poucas palavras, o que a pessoa procura.', true, 1, '[]'::jsonb),
      (v_organizacao_id, 'prazo', 'Urgência', 'SELECAO',
       'Para quando a pessoa precisa resolver.', false, 2,
       '["Imediato","Este mês","Sem pressa"]'::jsonb);
  end if;

  -- Agente de IA + versão 1 já publicada
  insert into agentes_ia (organizacao_id, nome, tipo, descricao, padrao)
  values (v_organizacao_id, 'Atendimento inicial', 'SDR',
          'Recebe quem chega, entende o motivo do contato, coleta o essencial e encaminha.',
          true)
  returning id into v_agente_id;

  insert into versoes_agente_ia (
    organizacao_id, agente_id, versao, status, origem, persona, tom,
    descricao_empresa, objetivos, regras, limitacoes, informacoes_proibidas,
    mensagem_fallback, criado_por, aprovado_por, aprovado_em, publicado_em,
    notas_da_versao, horarios
  ) values (
    v_organizacao_id, v_agente_id, 1, 'PUBLICADA', 'HUMANO',
    'Atendente do primeiro contato. Apresenta-se pelo nome da empresa, nunca como robô, e também nunca finge ser uma pessoa específica se perguntarem diretamente.',
    'Cordial, direto e profissional. Frases curtas. Sem gíria e sem emoji em excesso.',
    'Preencher na tela de configuração da IA com a descrição da empresa.',
    E'1. Entender o motivo do contato.\n2. Coletar as informações marcadas como obrigatórias, sem transformar a conversa em formulário.\n3. Encaminhar para o departamento certo quando o assunto sair do primeiro atendimento.',
    E'- Uma pergunta por vez.\n- Nunca repetir pergunta que a pessoa já respondeu.\n- Se a pessoa adiantar uma informação, registrar e seguir adiante.\n- Sem certeza, transferir para um atendente em vez de inventar.',
    E'- Não prometer resultado.\n- Não dar prazo que não esteja na base de conhecimento.\n- Não informar preço que não esteja escrito aqui.',
    'Dados de outros clientes, processos internos da empresa e qualquer informação que não esteja nesta configuração.',
    'Vou chamar um atendente para te ajudar com isso.',
    v_membro_id, v_membro_id, now(), now(),
    'Versão inicial criada junto com a organização.',
    jsonb_build_object(
      'fuso', 'America/Sao_Paulo',
      'dias', jsonb_build_object(
        '1', jsonb_build_array('08:00', '18:00'),
        '2', jsonb_build_array('08:00', '18:00'),
        '3', jsonb_build_array('08:00', '18:00'),
        '4', jsonb_build_array('08:00', '18:00'),
        '5', jsonb_build_array('08:00', '18:00')
      ),
      'fora_do_horario', 'Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Pode deixar sua mensagem que retornamos assim que abrirmos.'
    )
  ) returning id into v_versao_id;

  update agentes_ia set versao_publicada_id = v_versao_id where id = v_agente_id;

  insert into registros_auditoria (organizacao_id, ator_perfil_id, acao, entidade, entidade_id, metadados)
  values (v_organizacao_id, v_usuario, 'ORGANIZACAO_CRIADA', 'organizacoes', v_organizacao_id::text,
          jsonb_build_object('modelo', p_modelo));

  return v_organizacao_id;
end;
$funcao$;

-- Aceitar convite: vincula o usuário autenticado à organização do convite.
create or replace function aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $funcao$
declare
  v_usuario uuid := auth.uid();
  v_email text;
  v_convite convites%rowtype;
  v_membro_id uuid;
  v_departamento uuid;
begin
  if v_usuario is null then
    raise exception 'É preciso estar autenticado';
  end if;

  select email into v_email from perfis where id = v_usuario;

  select * into v_convite from convites where token = p_token for update;

  if not found then
    raise exception 'Convite não encontrado';
  end if;

  if v_convite.aceito_em is not null then
    raise exception 'Este convite já foi usado';
  end if;

  if v_convite.expira_em < now() then
    raise exception 'Este convite expirou';
  end if;

  -- O convite é nominal: vale para o e-mail que foi convidado.
  if lower(v_convite.email) <> lower(v_email) then
    raise exception 'Este convite foi enviado para outro e-mail';
  end if;

  insert into membros_organizacao (organizacao_id, perfil_id, papel)
  values (v_convite.organizacao_id, v_usuario, v_convite.papel)
  on conflict (organizacao_id, perfil_id) do update set ativo = true
  returning id into v_membro_id;

  foreach v_departamento in array v_convite.departamentos loop
    insert into membros_departamento (organizacao_id, departamento_id, membro_id)
    values (v_convite.organizacao_id, v_departamento, v_membro_id)
    on conflict do nothing;
  end loop;

  update convites set aceito_em = now() where id = v_convite.id;

  insert into registros_auditoria (organizacao_id, ator_perfil_id, ator_email, acao, entidade, entidade_id)
  values (v_convite.organizacao_id, v_usuario, v_email, 'CONVITE_ACEITO', 'convites', v_convite.id::text);

  return v_convite.organizacao_id;
end;
$funcao$;
