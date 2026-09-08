# Estado da implementação

Última atualização: 08/09/2026

Este documento diz o que existe, o que existe pela metade e o que não
existe. Ele é escrito para ser conferido, não para impressionar: se algo
está aqui como "implementado", é porque o código está no repositório e o
build passa.

**O que ainda não foi possível verificar:** o sistema nunca rodou contra
um Supabase de verdade nem contra uma Evolution API de verdade, porque
não há credenciais. Tudo abaixo foi verificado por tipo, lint, testes
automatizados e build. O que depende de banco real está marcado como
**não verificado em execução**.

Números do repositório: 124 arquivos TypeScript (~23.000 linhas), 11
migrações SQL (~2.500 linhas), 32 tabelas, 64 políticas de RLS, 28 funções
de banco, 128 testes.

---

## IMPLEMENTADO

### Banco e isolamento entre organizações
- 32 tabelas com chaves estrangeiras, índices e constraints
- RLS ligado em todas as tabelas de dados, com 64 políticas
- Toda tabela carrega `organizacao_id`; nenhuma leitura escapa do filtro
- Funções `SECURITY DEFINER` para quebrar a recursão de política em
  `membros_organizacao`
- Visibilidade de conversa por papel: gestor e supervisor veem tudo;
  atendente vê as suas, as sem departamento e as dos departamentos dele
- Privilégio revogado na coluna `canais.segredo_webhook`
- Bucket de mídia privado, com política por prefixo de organização
- Migrações versionadas, aplicadas uma única vez, cada uma em transação

### Autenticação e usuários
- Cadastro, login e logout com Supabase Auth
- Criação da organização na primeira entrada, com dois modelos de partida
- Convite por link, com prazo de 7 dias, nominal por e-mail
- Quatro papéis com hierarquia aplicada no servidor
- Departamentos por usuário
- Desativar usuário devolve as conversas dele para a fila
- Proteções: não alterar o próprio papel, não desativar a si mesmo, não
  desativar o último proprietário

### Canais de WhatsApp
- Vários números por organização
- Cadastrar, conectar (QR Code), desconectar, reconectar, conferir status
  e remover
- Status atualizado sozinho enquanto o QR Code está na tela
- IA ligada ou desligada por canal
- Departamento padrão por canal
- Endereço do webhook mostrado só a pedido, com opção de gerar outro
- Remoção bloqueada quando há conversa aberta
- Provedor simulado, que permite usar o sistema inteiro sem WhatsApp

### Central de atendimento
- Três colunas: caixas e lista, conversa, ficha do contato
- Oito caixas com contagem: minha, não atribuídos, IA, aguardando humano,
  aguardando cliente, em atendimento, encerrados, todas
- Filtro por departamento e busca por nome ou telefone
- Assumir, transferir (departamento e/ou pessoa), encerrar, reabrir,
  devolver para a IA
- Notas internas
- Etiquetas na conversa
- Envio de texto com atualização otimista e reversão em caso de falha
- Estado de entrega por mensagem (pendente, enviada, entregue, lida, falhou)
- Tempo real por Supabase Realtime, com aviso na tela quando cai
- Ficha: dados coletados, o que falta coletar, memória, resumo, origem

### O handoff IA ↔ humano
- Máquina de estados com cinco estados e transições declaradas
- Garantia no banco: `assumir_conversa()` e `registrar_mensagem_ia()`
  conferem o estado sob `FOR UPDATE`, na mesma transação da escrita
- Cliente respondendo **não** devolve a conversa para a IA
- A IA só volta por ação explícita de devolução
- Enviar mensagem assume a conversa automaticamente
- Job de IA que chega atrasado é descartado sem enviar nada

### Inteligência artificial
- Adapter de provedor; OpenAI implementada, simulado incluído
- Saída estruturada com JSON Schema estrito, conferida com Zod
- Contexto montado com dados estruturados + memória + resumo + últimas 20
  mensagens (não manda o histórico inteiro)
- Coleta de campos personalizados durante a conversa
- Memória por contato, com chave estável que evita fato contraditório
- Resumo incremental
- Triagem por departamento com critério configurável
- Transferência por confiança baixa (abaixo de 0,45)
- Horário de atendimento por dia da semana
- Limite de mensagens seguidas sem resposta do cliente
- Registro de cada chamada: tokens, latência, custo, erro
- Sem provedor configurado, a conversa vai para atendimento humano

### Versionamento da IA
- Rascunho, publicada, arquivada
- Editar nunca altera o que está no ar
- Publicar arquiva a anterior e aponta o agente na mesma transação
- Restaurar versão antiga cria rascunho (passa pela mesma revisão)
- Histórico com quem criou, quem aprovou e quando
- Visualização do conteúdo exato de cada versão

### Análise de atendimentos
- Botão que analisa as conversas do período (7 a 60 dias)
- Achados com número de ocorrências e trechos reais como evidência
- Sugestões pendentes, aprovadas e rejeitadas
- Aprovar aplica o texto num rascunho — nunca publica sozinho
- Texto sugerido é acrescentado, não substitui o que já existe
- Uma análise por vez

### Mídia
- Áudio: baixa, guarda e transcreve; a transcrição entra na mensagem
- Imagem: leitura automática que descreve o que aparenta conter
- Documento: recebido, guardado e disponível para o atendente
- Limite de 25 MB
- Falha de mídia não trava a conversa: a IA é acionada mesmo assim
- A leitura de imagem nunca afirma autenticidade de documento

### Contatos
- Lista com busca por nome ou telefone e filtro por etiqueta
- Ficha completa e editável, com campos personalizados
- Dado digitado por pessoa tem precedência sobre o deduzido pela IA
- Histórico de conversas
- Opt-out de campanha e bloqueio
- Normalização de telefone com as duas formas do nono dígito

### Campos personalizados
- Onze tipos
- Instrução por campo, escrita para a IA
- Marcar como necessário para qualificação
- A chave não muda depois de criada (é usada em campanha e planilha)

### Campanhas
- Criar com mensagem, variáveis e até cinco variações
- Prévia com dados de um contato real
- Intervalo entre envios, janela de horário, dias da semana, limite diário
- Destinatários por etiqueta, lista colada de telefones, ou toda a base
- Telefone que ainda não é contato vira contato
- Opt-out e bloqueio conferidos na montagem **e** no envio
- Iniciar, pausar, retomar, cancelar
- Um destinatário por trabalho, com reserva `FOR UPDATE SKIP LOCKED`
- Progresso em tempo quase real
- Variável sem valor pula o contato e registra o motivo
- Repique: quem responde é ligado à campanha e a IA retoma

### Google Sheets
- OAuth com escopo somente leitura
- `state` conferido no retorno
- Mapeamento de colunas, inclusive para campos personalizados
- Importação idempotente por linha
- Etiqueta e campanha de destino
- Sincronização automática por intervalo, e manual por botão

### Filas e worker
- Sete filas com política de tentativas e espera exponencial
- Falha esgotada vira registro em `falhas_trabalho`
- Quatro varreduras de recuperação: eventos atrasados, mensagens
  pendentes, planilhas e campanhas
- Encerramento gracioso
- Modo em memória para desenvolvimento, recusado em produção

### Webhook
- Autenticado pelo segredo do canal, na própria URL
- Confere que a instância da carga bate com o canal
- Limitador de taxa por canal
- Deduplicação por chave única
- Grava e enfileira; nada de pesado na resposta HTTP
- Responde 200 em evento repetido
- Se a fila estiver fora do ar, o evento fica gravado e é recuperado

### Painel e auditoria
- Dezesseis indicadores, com período de hoje, 7 ou 30 dias
- Gráfico de volume em HTML puro (sem biblioteca de gráfico)
- Conversas abertas por departamento
- Estado vazio honesto: sem dados, os números são zero
- Auditoria com 33 ações registradas, paginada, só de leitura

### Qualidade
- `npm run lint` — sem aviso e sem erro
- `npm run verificar` — sem erro de tipo
- `npm run teste` — 112 passando, 16 pulados (precisam de banco)
- `npm run build` — 25 rotas compiladas
- Nenhum `any`, `@ts-ignore`, `TODO`, `FIXME` ou `console.log` no código
- Nenhum dado de exemplo apresentado como real

---

## PARCIALMENTE IMPLEMENTADO

### Envio de mídia pelo atendente
**Funciona:** o serviço de envio (`lib/servicos/envio.ts`) monta e envia
imagem, áudio, vídeo e documento; o adapter da Evolution tem os métodos
prontos, inclusive o endpoint separado de áudio de voz.

**Falta:** o botão de anexar na tela da conversa. Hoje o atendente só
manda texto pela interface.

**Por quê:** exige upload com barra de progresso, prévia antes de enviar
e tratamento de arquivo grande — um bloco de trabalho por si só. O caminho
de baixo já está pronto e testado por tipo.

### Extração de texto de PDF
**Funciona:** o PDF é recebido, guardado e fica disponível para o
atendente abrir.

**Falta:** ler o conteúdo do PDF para dar à IA. Hoje só imagem tem leitura
automática.

**Por quê:** precisa de uma biblioteca de extração (`pdf-parse` ou
equivalente) e de uma decisão sobre PDF que é imagem escaneada, que
exigiria OCR.

### Limitador de taxa distribuído
**Funciona:** o limitador em memória protege login, cadastro e webhook.

**Falta:** contagem compartilhada entre instâncias. Com várias instâncias
na Vercel, o limite efetivo é o configurado vezes o número de instâncias.

**Por quê:** o Redis já está no projeto e resolveria — é um item pequeno,
mas não é defesa contra ataque distribuído de qualquer forma, que é
trabalho de camada de rede.

### Campanha agendada
**Funciona:** a coluna `agendada_para` existe e o estado `AGENDADA` está
no enum.

**Falta:** a tela para agendar e o gatilho que inicia no horário.

**Por quê:** ficou fora do corte. A varredura do worker já é o lugar
natural para isso.

### Múltiplos agentes de IA
**Funciona:** a tabela `agentes_ia` aceita vários agentes por organização,
com tipos (SDR, suporte, jurídico, administrativo).

**Falta:** a tela para criar um segundo agente e a regra de qual agente
atende qual departamento. Hoje o agente padrão atende tudo.

**Por quê:** a estrutura foi feita para não impedir; a interface e o
roteamento não entraram no corte.

---

## NÃO IMPLEMENTADO

| O quê | Por que ficou de fora |
| --- | --- |
| Respostas prontas e macros | Não estava no escopo pedido; é o próximo ganho de produtividade do atendente |
| Outros canais (Instagram, e-mail, site) | O escopo é WhatsApp. A estrutura de canal aceita outros tipos |
| Meta Cloud API | O adapter está previsto e a fábrica recusa com mensagem clara. Implementar é escrever uma classe |
| Pesquisa de satisfação (CSAT) | Fora do escopo |
| Relatório por atendente | O painel é da operação. Os dados existem em `eventos_conversa` |
| Cobrança e planos | O prompt pediu para não implementar agora. `organizacoes.limites` já existe |
| White label | Fora do escopo. Nada impede |
| Aplicativo móvel | A interface é responsiva; app nativo é outro projeto |
| Exportar conversa | Fora do escopo |
| Envio de e-mail pelo sistema | Decisão registrada em DECISOES-TECNICAS.md, item 11 |

---

## BLOQUEADO POR CONFIGURAÇÃO EXTERNA

Tudo abaixo está **implementado**, mas não pode ser exercitado sem
credencial. O código trata a ausência com mensagem que diz o que
preencher e onde.

| Integração | O que falta | Sem isso |
| --- | --- | --- |
| **Supabase** | Projeto criado e as três chaves | A aplicação não sobe. É o único obrigatório |
| **Evolution API** | Servidor no ar, URL e chave | Nenhum número real conecta. O provedor simulado permite usar o resto |
| **OpenAI** | Chave e crédito | A IA não atende; toda conversa vai para humano. Nada fica sem resposta |
| **Redis** | URL | Mensagens chegam e ficam gravadas, sem processar. Em desenvolvimento há o modo em memória |
| **Google** | Client ID e secret | A importação de planilha fica indisponível |
| **Domínio** | DNS apontado | O webhook não é alcançável e nenhuma mensagem chega |

O passo a passo de cada um está em `OWNER_SETUP_GUIDE.md`.

---

## TESTES EXECUTADOS

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ Sem avisos e sem erros |
| `npm run verificar` (tsc) | ✅ Sem erros de tipo |
| `npm run teste` | ✅ 112 passando · ⏭️ 16 pulados (precisam de banco) |
| `npm run build` | ✅ 25 rotas compiladas |

### O que os 112 testes cobrem

| Arquivo | Testes | O que prova |
| --- | --- | --- |
| `estados.teste.ts` | 15 | Handoff IA ↔ humano; nenhum estado oferece as duas respostas ao mesmo tempo |
| `idempotencia.teste.ts` | 13 | Chaves determinísticas para mensagem, webhook, campanha, planilha e clique duplo |
| `telefone.teste.ts` | 19 | Normalização, nono dígito, grupos ignorados, formatos de entrada |
| `campanhas.teste.ts` | 27 | Variáveis da mensagem, janela de envio com fuso, variação determinística |
| `evolution.teste.ts` | 22 | Leitura do webhook em vários formatos; nunca lança com carga corrompida |
| `seguranca.teste.ts` | 16 | Log sem segredo, limitador, decisão da IA conferida, nome de arquivo saneado |

### O que os 16 testes pulados cobrem

`banco.teste.ts` roda contra um Postgres de verdade, fingindo ser um
usuário logado (`set local role authenticated` + `request.jwt.claims`) —
o mesmo caminho do PostgREST. Ele prova:

- um usuário não enxerga contato, conversa nem canal de outra organização
- escrever em outra organização é recusado pelo banco
- `update` em linha de outra organização não afeta nada
- o segredo do webhook não é legível pelo usuário logado
- mensagem, chave de envio, conversa aberta e evento de webhook não
  duplicam
- **dois atendentes assumindo ao mesmo tempo: exatamente um vence**
- **a IA não consegue gravar resposta depois de um humano assumir**
- a IA volta a responder depois da devolução explícita
- dois workers na mesma campanha não pegam o mesmo destinatário

Para rodá-los: preencha `SUPABASE_DB_URL` no `.env.local`, rode
`npm run banco:aplicar` e depois `npm run teste`.

**Estes são os testes mais importantes do projeto.** Enquanto estiverem
pulados, o isolamento entre empresas está garantido por construção
(políticas escritas e revisadas), mas não por verificação em execução.

---

## PROBLEMAS CONHECIDOS

1. **O sistema nunca rodou contra um Supabase real.** Erro de digitação em
   nome de coluna dentro de uma migração só aparece ao aplicá-la. O
   primeiro `npm run banco:aplicar` é o teste de verdade — e, se falhar,
   falha inteira e desfeita, sem deixar o banco pela metade.

2. **A Evolution API muda de formato entre versões.** O adapter foi
   escrito para a v2 e aceita variações conhecidas da v1. Uma versão nova
   pode trazer um formato que o interpretador não reconhece — nesse caso
   ele devolve `IGNORADO` com motivo (não quebra), e o evento fica
   registrado em `eventos_webhook` para investigação.

3. **Redis da VPS alcançável pela Vercel.** Para a Vercel enfileirar, o
   Redis precisa estar acessível. Expor Redis na internet é perigoso. A
   saída recomendada no guia é um Redis gerenciado (Upstash). Sem
   resolver isso, o envio manual pela interface não enfileira — a
   mensagem fica gravada como pendente e é recuperada pela varredura do
   worker em até um minuto.

4. **Realtime precisa ser ativado no Supabase.** A migração adiciona as
   tabelas à publicação, mas alguns projetos exigem ativar em
   Database → Replication. Sem isso, a tela mostra "sem tempo real" e não
   atualiza sozinha.

5. **O limitador de taxa é por instância.** Ver *parcialmente
   implementado*.

6. **`next lint` está descontinuado no Next 16.** Funciona no 15, mas
   avisa. Na atualização para o 16, migrar para o ESLint CLI.

7. **A busca de contatos usa `ilike`.** Funciona bem até algumas dezenas
   de milhares de contatos. Acima disso, vale trocar por busca com
   `pg_trgm` (a extensão já está instalada e os índices já existem).

---

## DÍVIDA TÉCNICA

| Item | Impacto | Esforço |
| --- | --- | --- |
| Tipos do banco mantidos à mão | Migração e tipo podem sair de sincronia | Baixo (gerar pelo CLI quando houver banco) |
| Limitador de taxa em memória | Limite frouxo com várias instâncias | Baixo |
| Consultas separadas na central | Mais viagens ao banco | Médio (view tipada) |
| Sem cobertura de teste na interface | Regressão de tela não é pega | Médio (Playwright) |
| Sem testes de integração com a Evolution | Mudança de formato só aparece em produção | Médio (servidor falso) |
| `varrerCampanhasEmExecucao` reenfileira a cada 5 min | Pode gerar trabalho duplicado, inofensivo porque a reserva é atômica | Baixo |
| Sem métrica exportada (Prometheus/OTel) | Observabilidade depende de ler log | Médio |
| Sem retenção automática de mídia | O bucket cresce sem limite | Baixo |
| `contagens_caixas` roda `pode_ver_conversa` por linha | Fica lento com muitas conversas abertas | Médio |

---

## PRÓXIMAS PRIORIDADES

Em ordem de impacto sobre quem usa:

1. **Rodar as migrações num Supabase real e executar os 16 testes de
   banco.** É o que transforma "garantido por construção" em "verificado".

2. **Conectar um número de verdade e trocar dez mensagens.** Prova o ciclo
   inteiro: webhook, fila, IA, envio, entrega.

3. **Resolver o Redis para a Vercel.** Enquanto não estiver resolvido, o
   envio manual depende da varredura do worker.

4. **Anexo na tela da conversa.** O atendente precisa mandar documento —
   é o pedido que mais aparece na prática. O caminho de baixo já existe.

5. **Respostas prontas.** O maior ganho de produtividade por hora de
   trabalho investida.

6. **Campanha agendada.** Marcar para segunda às 9h em vez de lembrar de
   apertar iniciar.

7. **Extração de texto de PDF.** Fecha o ciclo de documentos.

8. **Testes de tela com Playwright.** Antes de a base de código crescer
   mais.

9. **Limitador no Redis.**

10. **Meta Cloud API como segundo provedor.** Tira a dependência de um
    número que pode ser banido.
