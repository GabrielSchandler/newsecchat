# NewSec Chat — prompt completo de implementação

**Repositório:** https://github.com/GabrielSchandler/newsecchat  
**Objetivo:** transformar a interface em uma central de atendimento profissional, com prioridade operacional, continuidade entre IA e humanos e controle para supervisores.  
**Idioma do produto:** português do Brasil.  
**Material de referência:** este documento e os prints anexados, identificados de 01 a 12.  
**Uso:** envie este arquivo e todos os prints à mesma tarefa no Codex ou Claude Code. O conteúdo abaixo já é a instrução de execução; não é necessário pedir que ele escreva outro plano de redesign.

---

## 1. Sua missão

Você vai implementar esta reformulação no repositório existente. Atue como engenheiro de produto com atenção à experiência de atendimento, à consistência dos dados e à qualidade visual. Examine o código, planeje brevemente, implemente, execute a aplicação e valide os fluxos no navegador. Continue até entregar uma alteração utilizável e verificável.

Os prints definem a direção visual aprovada. Este documento define os comportamentos, as regras e os critérios de conclusão. Entregue interfaces funcionais, conectadas aos dados e às permissões reais. Uma reprodução estática dos prints não conclui a tarefa.

**Contexto importante:** este handoff foi elaborado sem acesso ao código de `newsecchat`, pois o repositório retornou 404 no ambiente em que a proposta foi criada. Portanto, não há confirmação da stack, das tabelas, dos provedores, das integrações nem das funcionalidades já existentes. Não trate os nomes e estruturas sugeridos aqui como uma descrição do sistema atual. Faça esse levantamento no ambiente de execução, onde o repositório deverá estar disponível.

Os nomes, mensagens, números, horários, telefones mascarados e percentuais das imagens são exemplos de apresentação. Não os transforme em valores fixos da aplicação. As imagens também podem conter pequenas inconsistências de texto ou contagem geradas na composição visual. Para regras, fórmulas, permissões e estados, siga este documento; para aparência, hierarquia e organização, siga os prints. Corrija erros de grafia e inconsistências sem redesenhar o produto.

Em particular, um filtro ativo deve realmente restringir os resultados; a linha do tempo precisa estar ordenada; o perfil exibido deve corresponder às permissões; e um retorno reagendado deve mostrar o novo prazo. Não copie eventuais incoerências desses exemplos ilustrativos.

Não peça aprovação a cada escolha de implementação. Resolva decisões reversíveis com base no código e neste contrato. Se faltar uma credencial ou serviço externo, implemente e valide o restante com adaptadores ou fixtures de teste claramente separados da aplicação real, e registre o bloqueio concreto. Não publique mudanças em produção, altere credenciais reais nem envie mensagens a contatos reais como parte da validação.

## 2. O resultado esperado para o usuário

Um consultor deve conseguir responder, ao entrar no sistema:

1. Quem precisa de mim agora?
2. Quem ainda não recebeu atendimento?
3. Quem está esperando minha resposta, e há quanto tempo?
4. Para quem eu enviei a última mensagem e ainda não tive resposta?
5. Quem tem um retorno agendado ou vencido?
6. O que preciso fazer em seguida, sem perder o contexto da conversa?

Um supervisor deve conseguir identificar e resolver:

1. Conversas sem responsável e filas com atraso.
2. Distribuição de demanda entre equipes e consultores.
3. Atendimentos da IA, pedidos de ajuda e falhas.
4. Transferências e intervenções humanas com continuidade do histórico.
5. Problemas de conexão ou envio que impedem o atendimento.
6. Indicadores confiáveis, com definição e acesso à lista que originou o número.

A experiência deve manter a atenção no atendimento. Use indicadores para orientar uma ação concreta. Não ocupe a caixa de entrada com gráficos de gestão ou métricas decorativas.

## 3. Levantamento obrigatório antes da implementação

Leia as instruções do repositório, identifique as mudanças locais já existentes e preserve o trabalho do usuário. Inspecione, no mínimo:

- Framework, versões, gerenciador de pacotes, roteamento e componentes de interface.
- Autenticação, organização/tenant, equipes, perfis e autorização no servidor.
- Entidades de contato, conversa, mensagem, responsável, etiqueta, canal, retorno e nota interna.
- Sentido das mensagens, identificação de autor humano/IA, timestamps e estados de envio.
- Webhooks, eventos em tempo real, jobs, filas, reconexão e deduplicação.
- Configuração e execução da IA, solicitação de humano, pausa, retomada e transferência.
- Consultas de listagem, contadores e relatórios; filtros, paginação e índices existentes.
- Testes, comandos de build, execução local e ambientes disponíveis.

Produza uma matriz curta no repositório, seguindo sua convenção de documentação:

| Requisito | Implementação atual e arquivo | Fonte de dados | Ajuste necessário | Como validar |
|---|---|---|---|---|

Classifique cada recurso como existente, derivável dos dados atuais, extensão necessária ou dependência externa. Em seguida, implemente. Não encerre a tarefa somente com essa matriz.

Reutilize a stack e os serviços existentes. Não substitua autenticação, banco, provedor de mensagens ou biblioteca de componentes apenas para reproduzir a aparência. Não atualize dependências sem necessidade relacionada à tarefa. Adapte os nomes sugeridos neste documento às convenções do projeto.

## 4. Mapa de navegação e prints

Os caminhos abaixo são sugestões semânticas. Preserve rotas existentes quando isso evitar quebrar links e integrações; use redirecionamentos quando necessário.

| Print | Tela | Usuário principal | Rota sugerida | Ação principal |
|---|---|---|---|---|
| 01 | Atendimento / visão do consultor | Consultor | `/atendimento` | Responder e organizar a próxima ação |
| 02 | Supervisão da operação | Supervisor/gerente | `/supervisao` | Identificar e resolver pendências |
| 03 | Retornos e follow-up | Consultor e supervisor autorizado | `/retornos` | Abrir conversa, reagendar ou concluir retorno |
| 04 | Contatos e segmentos | Consultor e supervisor autorizado | `/contatos` | Encontrar um contato e sua próxima ação |
| 05 | Perfil do contato | Usuário com acesso ao contato | `/contatos/:id` | Recuperar contexto e abrir a conversa |
| 06 | Respostas rápidas | Consultor e gestor autorizado | `/respostas-rapidas` | Inserir textos revisáveis no atendimento |
| 07 | Equipes e distribuição | Supervisor/gerente | `/equipes` | Distribuir e transferir demanda |
| 08 | Assistente IA | Supervisor/gerente autorizado | `/assistente-ia` | Acompanhar e assumir atendimentos |
| 09 | Relatórios de atendimento | Supervisor/gerente | `/relatorios` | Avaliar operação e abrir o detalhamento |
| 10 | Canais | Administrador autorizado | `/configuracoes/canais` | Diagnosticar e recuperar conexão |
| 11 | Regras de atendimento | Administrador autorizado | `/configuracoes/atendimento` | Configurar prazos, horários e prioridades |
| 12 | Usuários e permissões | Administrador autorizado | `/configuracoes/usuarios` | Definir acesso e equipes |

No menu do consultor, priorize Atendimento, Contatos, Retornos e Respostas rápidas. No menu de gestão, inclua Supervisão, Equipes, Assistente IA e Relatórios. Configurações fica em posição secundária. Um supervisor que também atende mantém acesso à operação de consultor. Não implemente uma troca visual de perfil que conceda privilégios; qualquer alternância de contexto deve respeitar a sessão e as permissões reais.

Inclua Etiquetas como subseção simples de Configurações ou recurso contextual existente. Não é necessário inventar uma página analítica para etiquetas. O detalhe de uma equipe, a fila de um consultor e os formulários de transferência podem usar painéis laterais, preservando o contexto.

Os títulos grandes e numerados que ficam fora das janelas nos prints servem para o handoff. Eles não fazem parte da aplicação.

## 5. Contrato visual e adaptação de telas

Mantenha o sistema visual aprovado: barra lateral azul-marinho, fundo cinza muito claro, superfícies brancas, bordas discretas, texto escuro, destaque ciano e espaços bem definidos. Use violeta para IA, âmbar para atenção, vermelho para atraso/falha e verde para sucesso confirmado. Estado sempre precisa de texto ou ícone além da cor.

Tokens iniciais aproximados, a ajustar pela referência e pelo contraste:

| Token | Valor inicial |
|---|---|
| Fundo geral | `#F4F7FA` |
| Superfície | `#FFFFFF` |
| Navegação | `#172E3D` |
| Texto principal | `#15283B` |
| Texto secundário | `#58697C` |
| Borda | `#DCE5EC` |
| Ação primária | `#007F99` |
| Seleção suave | `#E6F6FB` |
| IA | `#6D4AFF` |
| Atenção | `#B65B05` |
| Erro / vencido | `#C63546` |
| Sucesso | `#16835D` |

Centralize tokens e componentes. Reutilize tipografia, botões, campos, badges, tabelas, avatar, tooltip, tabs, alertas e drawers. Prefira a família tipográfica já disponível; Inter ou equivalente é referência de aparência, sem download externo obrigatório. Base de 14 px, textos auxiliares de pelo menos 12 px, títulos de 20–24 px, espaçamento em múltiplos de 4/8 px, bordas de 1 px, raios de 6–10 px. Evite excesso de sombras, gradientes e cartões grandes com pouco conteúdo.

No atendimento desktop, use quatro regiões: navegação, lista de conversas, conversa e contexto do contato. Em torno de 1440 px: navegação ~184 px, lista ~320 px, contexto ~280 px e conversa ocupando o restante. Esses valores são referências, não uma soma rígida que cause overflow. A conversa precisa continuar útil. Em telas intermediárias, reduza a navegação e transforme o contexto em drawer; no celular, apresente lista, conversa e contato como etapas navegáveis.

- Valide em 1440×900, 1280×800 e 390×844.
- Nenhum scroll horizontal da página; tabelas extensas podem ter scroll local identificado.
- Altura da aplicação acompanha a janela; regiões longas têm scroll próprio previsível.
- Composer permanece acessível com teclado móvel aberto e respeita áreas seguras.
- Foco visível, labels acessíveis, contraste AA, atalhos documentados e controles utilizáveis por teclado.
- Alvos de toque adequados; botões de ícone têm nome acessível e tooltip.
- Preserve seleção, filtros e posição ao abrir e fechar drawers ou voltar de um contato.
- Não reordene a conversa selecionada de modo a fazê-la desaparecer enquanto o consultor escreve.
- Nunca limpe um rascunho por atualização em tempo real, falha ou troca de filtro.
- Persistência de rascunho deve ser isolada por usuário/organização/conversa e não vazar entre sessões; considere a política de dados do projeto.

## 6. Especificação por tela

### 01 — Atendimento do consultor

Esta é a tela principal do trabalho diário. O print aprovado define a estrutura de quatro regiões.

**Lista:** busca por nome/telefone; escopo explícito como “Minha fila”; filtros Prioridades, Novos, Para responder, Retornos, Aguardando cliente e Todos; ordenação por urgência ou atividade recente. Mostre filtros adicionais para equipe, canal, etiqueta e responsável conforme a permissão. As contagens representam o mesmo universo da lista.

Cada linha mostra contato, trecho da última mensagem pública, autor (“Cliente”, “IA”, “Você” ou nome real do colega), horário, sinal de não lido e situação operacional. O badge de não lido não substitui o badge “Para responder”. Destaque espera ou retorno vencido sem transformar toda a lista em avisos vermelhos.

**Conversa:** cabeçalho com contato, canal, responsável e ações Transferir/Concluir. Apresente o estado “Com IA”, “Aguardando humano” ou “Atendimento humano · IA pausada” com clareza. Mostre a espera desde o primeiro pedido ainda sem resposta. O histórico diferencia cliente, consultor, IA, eventos de transferência e notas internas, com autoria e hora.

**Composer:** modos visualmente distintos “Mensagem” e “Nota interna”; texto, anexos e recursos já suportados pelo provedor; respostas rápidas e indicação de envio. Nota interna precisa dizer “Visível apenas para a equipe” e usar aparência diferente. Não mostre áudio/anexo como ação funcional se o backend não o suporta. Se o envio falhar, preserve conteúdo, informe o motivo conhecido e ofereça ação segura de tentar novamente. Não confirme entrega sem recibo correspondente.

**Contexto:** dados relevantes do contato, etiquetas, equipe, responsável, canal e próxima ação. Agendar retorno abre formulário compacto. Um resumo da IA, quando implementado, é identificado como sugestão, tem data e pode apontar às mensagens de origem. Não o apresente como informação confirmada pelo cliente.

Permita abrir a próxima pendência após concluir um atendimento, com ação explícita. A lista não pode obrigar o consultor a reconstruir sua posição a cada resposta.

### 02 — Supervisão da operação

Filtros por equipe, consultor e canal, com horário da última atualização. Cartões de situação atual: Sem responsável, Aguardando equipe, Retornos vencidos e Com IA. Clicar abre a lista correspondente com filtros preservados.

A área principal é a fila que precisa de atenção: contato, equipe, responsável, motivo, espera/prazo e ação. Una pendências sem duplicar a mesma conversa em várias linhas. Mantenha motivos secundários como badges quando necessário.

Mostre carga por consultor como contagem de conversas abertas, pendências de resposta e retornos. **Correção do primeiro print:** não exiba porcentagem de carga sem uma capacidade configurada e um denominador verificável. Se não existir capacidade, mostre apenas contagens. Status “online” também depende de presença real, não do login ou de uma variável fixa.

O painel de monitoramento da IA permite ler, assumir ou encaminhar. “Assumir e pausar IA” precisa refletir uma mudança efetiva no servidor antes de habilitar o envio humano. O supervisor vê somente o escopo autorizado.

### 03 — Retornos e follow-up

Abas Vencidos, Hoje, Próximos, Sugestões; concluidos/cancelados disponíveis em filtro secundário. Cada item mostra contato, motivo, prazo local, responsável, último envio relevante e ações Abrir conversa, Reagendar e Marcar como feito.

Separe visualmente tarefa agendada de sugestão automática. “Eu enviei por último” não significa “o cliente precisa receber outra mensagem agora”. Uma sugestão é uma oportunidade de revisar, não um envio automático.

Agendamento exige data/hora, responsável elegível e motivo ou nota curta. Use o fuso da operação e mostre-o no formulário. Valide prazos passados; se houver necessidade de cadastrar tarefa já vencida, exija escolha explícita. Reagendar registra autor e prazo anterior. Concluir uma tarefa não conclui a conversa automaticamente.

Quando o cliente responder antes do retorno, invalide a sugestão baseada em ausência de resposta. Para tarefas manuais, preserve a intenção: sinalize “Cliente respondeu; revisar retorno” e permita concluir ou reagendar. Não cancele automaticamente compromissos não relacionados à falta de resposta.

### 04 — Contatos e segmentos

Busca e filtros por responsável, equipe, etiquetas, último remetente, última interação e próxima ação. Tabela com identidade, contexto e ação; evite um cadastro que esconda a situação do atendimento.

Os atalhos Todos, Meus contatos e Sem resposta ao meu envio usam o escopo autorizado. Permita salvar uma combinação de filtros se houver suporte existente ou se puder implementá-la de forma simples. “Segmento” é filtro salvo, sem criar duplicatas do contato.

Ao clicar na linha, abra o perfil; ação separada abre a conversa correta. Um contato pode ter mais de uma conversa/canal: não escolha silenciosamente uma conversa encerrada ou de outro número. Identificadores devem ser normalizados conforme o provedor; não mescle pessoas apenas por nomes iguais.

### 05 — Perfil do contato

Identidade e campos reais, etiquetas, equipe/responsável do atendimento selecionado, conversas relacionadas, próxima ação e histórico. Use abas Histórico, Notas internas e Retornos.

A linha do tempo distingue mensagem pública, nota interna, atribuição, transferência, retorno e conclusão. Preserve autoria, timestamp e ordenação consistente. Histórico paginado. Campos sem informação mostram “Não informado” com ação apropriada, sem dados fictícios.

Notas internas não entram no transporte público de mensagens, em resumos externos ou em exportações destinadas ao cliente. Distingua “dados do contato” de “dados desta conversa” quando houver vários atendimentos.

### 06 — Respostas rápidas

Busca, categorias, atalhos e separação Minhas respostas / Da equipe. Editor de nome, atalho, corpo e variáveis suportadas, com prévia usando um contato de exemplo apenas no editor.

Inserir resposta rápida cria um rascunho editável. Não envia automaticamente. Variável ausente deve ser apontada; não envie literalmente `{{primeiro_nome}}`. Valide atalhos duplicados no respectivo escopo e permissões de editar respostas compartilhadas.

Não confunda respostas rápidas locais com templates aprovados por um provedor. Se a integração exigir templates ou restringir mensagens livres em certas situações, mantenha esse fluxo real e explique a restrição contextual ao consultor.

### 07 — Equipes e distribuição

Mostre totais da equipe e tabela de consultores: abertas, para responder, retornos vencidos e ação Ver fila. Conversas sem responsável aparecem de modo evidente. Preserve a distinção entre abertas atribuídas e abertas totais, que incluem as não atribuídas.

Detalhar um consultor abre sua fila sem perder os filtros. Transferir abre drawer com contato, origem, equipe de destino, responsável elegível, motivo e nota interna opcional. Exiba contagens atuais do destino, sem inventar uma avaliação de capacidade.

Transferir para uma equipe sem consultor deve colocar o atendimento numa fila humana visível. Não pode criar atendimento órfão. Transferências têm evento de auditoria e não zeram o tempo de espera do cliente. Operações em lote, se já existirem, precisam mostrar o número de itens e tratar resultados parciais.

### 08 — Assistente IA

Monitoramento separado de configuração. Abas Em atendimento, Pedindo apoio e Falhas, com lista pesquisável e filtros de equipe/canal. Mostre estado atual, motivo da intervenção e espera, apoiados em eventos reais.

Conversa selecionada mostra histórico e ações Assumir atendimento / Atribuir a consultor. Pedido explícito de humano deve ficar visível, com IA pausada para respostas de conteúdo enquanto aguarda atribuição. Eventual confirmação de encaminhamento é separada e não encerra a espera por humano.

Resumo sugerido é opcional e depende de implementação real. Não invente score de confiança, satisfação, taxa de resolução pela IA ou “sentimento” sem coleta, definição e cobertura. Falha da IA deve oferecer passagem para humano, sem aprisionar o contato num fluxo quebrado.

Se existir configuração do assistente, preserve-a e separe edição/teste de ativação. Um teste usa dados de teste e nunca envia mensagem ao cliente. A retomada da IA em conversa assumida requer ação explícita e permissão; não deve acontecer por timeout do navegador.

### 09 — Relatórios de atendimento

Separe “Situação agora” de “Desempenho no período”. Filtre por intervalo de datas, equipe e canal; inclua consultor onde a atribuição histórica for confiável. Informe fuso, calendário usado e cobertura dos dados.

Indicadores iniciais: conversas iniciadas, conversas concluídas, primeira resposta humana mediana e percentual dentro da meta. Tabela por equipe com o mesmo contrato. Gráficos só entram se comunicarem uma comparação ou tendência válida; tabela e acesso ao detalhe têm prioridade.

Cada métrica tem tooltip com definição, universo, exclusões e unidade. Exportações usam o mesmo filtro, fuso, autorização e consulta lógica da tela. Não exiba zero para ausência de instrumentação. Não invente CSAT, vendas, receita ou conversão porque um print tenha espaço livre.

### 10 — Canais e saúde da conexão

Mostre somente integrações reais. Para cada canal: identificação segura, equipe vinculada, estado conhecido, horário do último evento e falhas de envio. Diferencie Conectado, Reconexão necessária, Conectando e Estado desconhecido conforme os estados que o provedor permite conhecer.

Último evento antigo, isoladamente, não prova desconexão. Preserve o estado desconhecido quando não houver evidência de conexão. Reconectar deve abrir o mecanismo real do projeto, sem QR ilustrativo ou botão sem efeito.

Falhas levam às mensagens afetadas, com motivo compreensível e tentativa segura de recuperação. Proteja tokens, credenciais, QR/sessões e logs sensíveis. Restringir a tela não substitui autorização nos endpoints.

### 11 — Regras de atendimento

Configurações persistidas e validadas: fuso da operação, dias úteis, intervalos de atendimento, feriados/exceções, meta de primeira resposta humana, limiar de aviso preventivo, intervalo para sugerir follow-up e política de reabertura.

O aviso preventivo deve ser anterior à meta. Explique se o prazo é corrido ou útil e mantenha coerência com os relatórios. Exemplo de prévia: operação 09:00–18:00, meta 10 minutos úteis e mensagem às 17:58 resultam em prazo às 09:08 do próximo dia útil, se não houver feriado.

Separe primeira resposta humana de respostas seguintes. Uma opção avançada pode herdar explicitamente o mesmo prazo para os próximos turnos ou definir outro. Sem meta para os próximos turnos, mostre a espera atual, mas não a rotule como violação da meta de primeira resposta. O relatório de primeira resposta continua usando apenas o primeiro atendimento humano elegível.

Mostre alterações não salvas e resultado do salvamento. Configuração alterada tem autor, data e versão; não reescreva silenciosamente o desempenho histórico com a nova meta. A interface pode usar uma política única por organização inicialmente; respeite políticas por equipe/canal caso o modelo atual as suporte.

### 12 — Usuários e permissões

Busca, usuários, perfil, equipes, situação da conta e escopo de acesso. Editor claro para Consultor, Supervisor/Gerente e Administrador, adaptado aos papéis existentes.

Permissões relevantes: ver próprias conversas, acessar fila sem responsável de equipes autorizadas, assumir, transferir, supervisionar equipes, gerenciar IA, canais, regras e usuários. Explique heranças sem expor JSON de autorização ao usuário final.

Convite só é funcional se houver mecanismo real de convite. Desativar acesso deve impedir novas operações e respeitar a política de invalidação de sessão do projeto. Trate pendências do usuário desativado mediante redistribuição; não deixe contatos invisíveis ou apague o histórico de autoria.

## 7. Contrato dos estados e das filas

Não comprima conceitos diferentes em um único campo `status`. Use o modelo existente e complete os eixos ausentes quando necessário:

| Eixo | Exemplo de significado |
|---|---|
| Ciclo da conversa | Aberta ou concluída |
| Responsabilidade | Equipe e consultor, com ausência explícita de responsável |
| Modo de atendimento | IA ativa, fila humana, humano ativo; pausa da IA representada sem ambiguidade |
| Turno pendente | Equipe/IA precisa responder, cliente precisa responder, nenhum turno pendente |
| Triagem | Ainda não triada ou triada por uma ação operacional |
| Leitura | Contagem/posição de não lidos por usuário |
| Prazo | Início da espera, meta aplicável e vencimento |
| Retorno | Tarefa independente, com prazo, dono, motivo e estado |
| Envio | Pendente, aceito/enviado, entregue, lido ou falhou, conforme evidência do provedor |

`last_message_at`, “não lido” e “cliente aguarda” não são equivalentes. Notas internas e eventos do sistema não alteram quem enviou a última mensagem pública nem encerram a espera do cliente.

Defina uma projeção de conversa no servidor, atualizada pelos eventos relevantes. Ela pode guardar o último remetente público efetivo, início da pendência, responsabilidade, modo e próxima ação para tornar filas e contadores eficientes. Não mantenha regras concorrentes em cada componente frontend.

### Definição dos filtros

| Filtro | Regra de inclusão |
|---|---|
| Todos | Todas as conversas abertas no escopo atual; concluídas ficam em filtro explícito |
| Novos | Abertas ainda não triadas; abrir/ler a linha não é triagem. Assumir ou realizar triagem explícita registra o evento |
| Para responder | Conversas que aguardam ação humana: mensagem do cliente sem resposta humana efetiva quando exigida, ou pedido de humano pendente |
| Aguardando cliente | Abertas com último turno público humano efetivo, sem nova resposta do cliente e sem pedido humano pendente |
| Retornos | Conversas com tarefa pendente no intervalo escolhido; vencidos em destaque |
| Com IA | Conversas sob responsabilidade ativa da IA, com estados de erro/encaminhamento destacados |
| Sem responsável | Fila humana aberta sem consultor atribuído; não confundir com atendimento normal sob IA |
| Prioridades | União deduplicada das pendências que exigem atenção, com motivo principal e demais motivos como contexto |

Os filtros podem se sobrepor. “Novos” pode incluir itens “Para responder”. Não some badges como se fossem fatias exclusivas do total. Contadores de caixa de entrada contam conversas distintas; contadores da página de retornos contam tarefas e devem identificá-las como tal quando a distinção for relevante.

Ordenação padrão das prioridades: prazo de resposta humano vencido; pedido de humano ainda não assumido; retorno vencido; conversa nova/sem responsável; demais pendências por vencimento próximo. Dentro do grupo, use prazo ou início mais antigo, com desempate estável por identificador. Não crie um score opaco. Se uma regra existente for diferente, harmonize-a e documente a escolha.

Uma mensagem nova do cliente reabre a necessidade de resposta mesmo se foi lida ou se há um retorno futuro. A tela deve continuar exibindo a pendência até uma ação que realmente a resolva.

### Qual mensagem encerra uma espera?

- Mensagens públicas de saída efetivas contam como resposta conforme o modo responsável por aquele atendimento.
- Uma mensagem apenas em fila local, um rascunho, nota interna, erro de envio ou evento de leitura não conta.
- Use o evento de aceitação do provedor como evidência mínima de envio, quando esse for o contrato real da integração. Não o rotule como entrega ao cliente.
- Se depois houver falha definitiva do envio que fechou a pendência, recompute a projeção e restaure a espera original quando não existir outra resposta válida. Preserve os eventos históricos.
- Quando houver necessidade de humano, mensagens da IA e confirmações automáticas de encaminhamento não encerram essa espera. A primeira resposta humana só existe com autor humano verificado.
- Várias mensagens seguidas do cliente pertencem à mesma espera até a resposta correspondente. O início é a primeira mensagem desse grupo, e não a mais recente.
- Transferir, atribuir, abrir ou marcar como lido não reinicia o cronômetro.

Registre o tipo de evento/autor; não deduza se uma mensagem foi humana ou automática apenas procurando palavras no corpo.

## 8. Retornos, etiquetas e alertas

Etiquetas descrevem contexto: Novo lead, Documentos, Proposta enviada, entre outras configuráveis. A condição “Para responder” deve vir dos eventos, não de uma etiqueta que alguém pode esquecer de aplicar.

Uma sugestão de follow-up exige: conversa aberta, acesso autorizado, último turno público relevante de um humano, tempo configurado transcorrido sem resposta do cliente e ausência de tarefa equivalente pendente. Mensagens exclusivamente automáticas não devem aparecer como “meu último envio”. Uma conversa já concluída não entra nas sugestões automaticamente.

Agendar é criar uma tarefa. Não autoriza disparo de mensagem nem campanha. Uma tarefa tem identificador, conversa, responsável, vencimento, motivo, estado, autoria e histórico de alterações. Estados mínimos: pendente, concluída e cancelada; reagendamento é alteração auditável do prazo. Evite criar duplicatas por clique duplo.

Alertas úteis: cliente aguardando além do limite preventivo, prazo vencido, retorno vencido, pedido de humano sem responsável, falha de envio, canal com falha confirmada e erro da IA. Todos precisam identificar a situação e levar à ação pertinente. Não alerte repetidamente para o mesmo evento em cada atualização de tela.

Use badges, linha contextual e central de notificações quando existente. Não dispare toast, som ou notificação do navegador a cada mensagem sem política e preferência do usuário. Som e notificação externa dependem da configuração do usuário; alertas visuais operacionais permanecem claros.

## 9. Transferência, IA e concorrência

Estas regras são essenciais para impedir respostas duplicadas ou atendimentos perdidos:

1. Assumir atendimento deve ser uma operação atômica: verificar acesso/versão, atribuir, alterar modo e pausar a IA.
2. Um job de IA pode estar gerando resposta no instante da intervenção. Verifique novamente a posse/modo/versão imediatamente antes de enviar ao provedor; cancele ou descarte a saída obsoleta. Cancelar somente a animação no frontend não é suficiente.
3. Serialize a decisão final de envio e a transferência de posse por conversa, usando transação, lock, versão/fencing token ou mecanismo equivalente da stack. Elimine a janela em que um job antigo inicia um novo despacho depois da confirmação de tomada de controle.
4. Se uma mensagem já tiver sido aceita pelo provedor, não prometa removê-la. Uma requisição de envio já transmitida e ainda sem resultado também pode ser impossível de cancelar: mostre “Envio da IA em confirmação”, reconcilie o resultado e não finja que foi descartada. A tomada de controle bloqueia novos despachos; diferencie esse bloqueio da conclusão de uma operação externa já em trânsito.
5. Dois consultores tentando assumir devem obter um resultado consistente. O segundo recebe o responsável atual e pode atualizar sua tela; ambos não podem acreditar que adquiriram a conversa.
6. Transferência registra origem, destino, autor, motivo e horário. O destino deve estar no escopo permitido e ter conta/equipe elegível.
7. Pedido de humano pausa respostas de conteúdo da IA e entra numa fila visível. Uma confirmação automática de encaminhamento, se configurada, deve ser enviada no máximo uma vez por solicitação e não mascarar a espera.
8. Retomar IA é ação explícita, auditável e autorizada. Concluir atendimento não retoma IA implicitamente.
9. Se o responsável mudar enquanto há rascunho, preserve o texto e informe o conflito. Revalide permissão antes do envio; não deixe o antigo responsável enviar por uma tela desatualizada.
10. Concluir conversa exige estado consistente. Se chegou mensagem nova depois da versão vista pelo usuário, sinalize antes de encerrar. Informe retornos pendentes e permita decidir o destino deles; não descarte silenciosamente uma tarefa futura.

## 10. Indicadores e cálculos

Centralize definições no backend ou numa camada de domínio compartilhada. A interface, os contadores, os filtros e a exportação devem consumir as mesmas regras.

### Instantes, duração e calendário

Armazene instantes de forma inequívoca, preferencialmente UTC, e converta para o fuso da operação na apresentação. Use intervalos de período com início inclusivo e fim exclusivo. Datas locais, feriados, intervalos de almoço, horário de verão quando aplicável e jornadas que atravessam meia-noite devem ser tratados por uma biblioteca/serviço apropriado, não por subtrações ingênuas de strings.

Defina `tempo_util(inicio, fim, calendario)` como a soma da interseção do intervalo com os períodos de atendimento válidos. Para uma meta em minutos úteis, o vencimento é o instante em que se acumula esse total. Fora do expediente, o relógio útil pausa e a UI explica isso. A espera corrida pode ser mostrada separadamente, com rótulo distinto.

Política de meta/calendário deve ter versão ou snapshot associado ao atendimento para preservar comparabilidade histórica. Novas regras valem prospectivamente conforme política explícita; não reclassifique silenciosamente o passado.

### Contrato de cada indicador

| Indicador | Definição |
|---|---|
| Sem responsável agora | Conversas distintas abertas em fila humana sem consultor, no escopo autorizado |
| Aguardando equipe agora | Conversas distintas com espera humana pendente; leitura e mensagens automáticas não removem a condição |
| Retornos vencidos agora | Tarefas pendentes com vencimento anterior ao instante atual; fila de conversas deduplica por conversa |
| Com IA agora | Conversas abertas cujo modo efetivo é IA ativa; pedidos de humano pendentes aparecem separadamente |
| Conversas iniciadas no período | Conversas distintas criadas em `[inicio, fim)` conforme a definição existente de conversa |
| Conversas concluídas no período | Conversas distintas com evento válido de conclusão no intervalo; múltiplas conclusões da mesma conversa contam uma vez neste indicador, e reaberturas são informadas |
| Primeira resposta humana mediana | Mediana dos tempos até a primeira resposta pública humana efetiva, na população elegível descrita abaixo |
| Dentro da meta de primeira resposta | Quantidade de primeiras respostas elegíveis dentro da meta histórica / quantidade de primeiras respostas elegíveis da mesma população × 100 |

Para a primeira resposta humana, use o início da espera humana: primeira entrada quando o fluxo começa com humanos; solicitação/encaminhamento quando a conversa começa com IA. Não cobre tempo de uma conversa que estava legitimamente sob IA como atraso do consultor. Se for útil medir entrada até primeiro humano, crie um indicador separado, com nome distinto.

A população inicial do relatório de resposta é a das conversas cuja **primeira resposta humana efetiva ocorreu no período selecionado**. Explique isso no tooltip. Mostre separadamente quantas esperas humanas permanecem abertas e quantas estão vencidas. Assim, o percentual entre respostas concluídas não esconde a fila ainda sem resposta. Não misture essas conversas pendentes no denominador sem definir outra métrica de coorte.

Use a meta e o calendário vigentes no início da espera. Se faltar histórico suficiente, marque o registro como não elegível e informe a quantidade excluída. Denominador zero deve mostrar “Sem respostas elegíveis”, não 0% ou 100%. Se a instrumentação começou recentemente, informe a data de cobertura.

Mediana global é calculada sobre registros individuais, nunca pela média das medianas das equipes. Percentual global usa numeradores e denominadores agregados, nunca média simples de percentuais. Durações não devem ser arredondadas antes da agregação. Exiba unidade e arredondamento apenas na apresentação.

Filtros históricos de equipe/consultor usam a atribuição no evento pertinente: equipe na criação para iniciadas, autor/equipe na resposta para resposta e equipe na conclusão para concluídas. Não reatribua todo o passado ao responsável atual. Se esses eventos ainda não existem, mostre a limitação e instrumente o futuro; não invente o histórico.

### Casos numéricos mínimos para validar

- Cliente envia às 10:00 e 10:04; humano responde às 10:10: espera de 10 minutos, não 6.
- Nota interna às 10:05 e leitura às 10:06 não alteram o caso anterior.
- Transferência às 10:08 não reinicia o prazo.
- Cliente pede humano às 10:00; IA confirma às 10:01; humano responde às 10:12: primeira resposta humana de 12 minutos.
- Meta de 10 minutos úteis, jornada 09:00–18:00, entrada 17:58: prazo 09:08 do próximo dia útil, considerando feriados.
- Equipe A: 17/20 respostas no prazo; equipe B: 9/11. Global: 26/31 ≈ 83,87%, exibido como 84% se arredondado a inteiro.
- Nenhuma resposta elegível: indicador sem percentual e explicação do estado.

## 11. Dados, API e desempenho

Não imponha o esquema abaixo literalmente. Confirme entidades equivalentes no código e faça a menor extensão consistente:

- Organização e vínculo do usuário; equipes e permissões.
- Contato e identidades por canal/provedor.
- Conversa, ciclo, modo, equipe, responsável, versão e projeção de pendências.
- Mensagem com direção, tipo público/interno, autor humano/IA/sistema, timestamps e estados do provedor.
- Tarefa de retorno, etiqueta e vínculo, resposta rápida e escopo.
- Eventos de atribuição/transferência/conclusão/reabertura/IA e alterações administrativas.
- Política de atendimento/calendário, com versão e vigência.

Todas as mutações relevantes devem validar entrada, organização, escopo e estado no servidor. Inclua proteção contra repetição onde houver cliques duplos, retries ou entrega duplicada de webhook. Chaves de deduplicação devem considerar o identificador do evento/mensagem e seu escopo real de provedor/canal/organização.

Receber o mesmo webhook duas vezes não pode duplicar a mensagem, a conversa, o retorno nem a notificação. Eventos atrasados ou fora de ordem não podem retroceder indevidamente o estado de envio ou substituir a última atividade por uma antiga. Reconcilie eventos com precedência e timestamps apropriados ao contrato do provedor.

Um envio de resultado desconhecido exige consulta/reconciliação antes de retry cego quando houver risco de duplicação. Ao retransmitir uma tentativa conhecida como falha, mantenha correlação e histórico. Uma nova mensagem do usuário e uma repetição de transporte são conceitos diferentes.

Use paginação no servidor para contatos, conversas, mensagens e eventos. Evite carregar o histórico inteiro ou buscar dados linha a linha. Reutilize cache e invalidação conforme a stack. Consultas de contagem precisam compartilhar predicados com as listas. Adicione índices justificados pelos filtros e valide planos quando houver acesso ao banco de desenvolvimento.

A atualização em tempo real deve preservar filtros, seleção e rascunho. Ao reconectar, sincronize eventos perdidos e estados; não presuma que a conexão recebeu tudo. Use atualização incremental e virtualização apenas onde volume e componentes existentes justificarem. Teste listas com volume representativo em fixtures, sem introduzir uma infraestrutura nova só por hipótese.

Enquanto dados estão chegando, use skeletons com estrutura estável. Em atualização em segundo plano, preserve os dados anteriores e indique atualização se relevante. Erro de rede não vira fila vazia. Estado vazio diferencia “nenhum resultado para este filtro”, “nenhum contato ainda” e “não foi possível carregar”.

Migrações devem preservar dados e ser compatíveis com a estratégia de deploy do projeto. Evite apagar colunas/tabelas para simplificar. Quando não for possível reconstruir autoria humana/IA ou eventos históricos com evidência, mantenha “desconhecido” e exclua dos cálculos correspondentes com cobertura explícita.

## 12. Autorização e proteção do contexto

O frontend adapta a navegação, mas a autorização real é no backend e, quando aplicável, nas políticas do banco. Valide leitura, escrita, busca, contagem, exportação, anexos e eventos em tempo real.

- Consultor vê conversas próprias e filas de equipe que lhe foram autorizadas.
- Supervisor vê e atua nas equipes autorizadas.
- Administrador gerencia o escopo da organização; não recebe acesso a outra organização.
- Assumir uma conversa sem responsável depende da permissão e da equipe.
- Transferir exige permissão na origem e destino elegível.
- Notas internas, anexos e busca obedecem ao mesmo escopo da conversa.
- A contagem não deve revelar existência de contatos de outro tenant ou equipe restrita.
- Identificadores recebidos do cliente não são prova de autorização.
- Alterações de perfil, canal, regra e responsável têm autoria auditável.
- Conteúdo fornecido por contatos é dado não confiável: renderize com segurança e não permita que texto de mensagem altere as regras da IA ou conceda privilégios.

Preserve os mecanismos de proteção existentes. Não coloque segredos no bundle do navegador e não registre corpos de mensagens, credenciais ou dados pessoais completos em logs desnecessários.

## 13. Plano de execução e critérios de conclusão

Trabalhe em etapas que mantenham a aplicação utilizável:

1. Levantamento, contratos de estados e identificação das fontes de dados.
2. Estrutura visual, navegação por perfil e componentes compartilhados.
3. Atendimento, filtros, contadores e próximo passo.
4. Retornos, contatos, perfil e respostas rápidas.
5. Supervisão, equipes, transferência e controle da IA.
6. Relatórios, canais, regras e permissões.
7. Verificação visual e funcional, correções e documentação final.

Implemente frontend e backend necessários em cada etapa, evitando acumular telas que só funcionam com dados simulados. Fixtures são aceitáveis em testes e ambiente de demonstração explicitamente separado. Na aplicação normal, não substitua erro de API por dados de exemplo.

### Validação funcional essencial

Use a estrutura de testes existente. Foque regressões de regras e fluxos críticos, sem criar testes que apenas repitam a implementação ou conferir dezenas de classes CSS.

| Cenário | Resultado esperado |
|---|---|
| Nova mensagem de cliente | Conversa e contadores atualizados no escopo correto |
| Abrir/ler uma conversa pendente | Pode reduzir não lidos; continua em Para responder |
| Cliente envia várias mensagens | Cronômetro começa na primeira ainda sem resposta |
| Nota interna ou evento de transferência | Não encerra espera nem muda último remetente público |
| Envio humano válido | Atualiza turno e histórico conforme evidência do provedor |
| Envio falha ou fica com resultado desconhecido | Não finge sucesso; preserva rascunho e permite recuperação segura |
| Cliente responde ao último envio humano | Remove a sugestão por ausência de resposta e volta à fila de resposta |
| Retorno vence, é reagendado ou concluído | Estado, contador, dono e histórico permanecem coerentes |
| Pedido explícito de humano | IA deixa de responder conteúdo e fila humana fica visível |
| Humano assume durante geração da IA, antes do despacho | Resposta automática obsoleta não é despachada após confirmação da tomada de controle |
| Humano assume com requisição de envio da IA já em trânsito | Nenhum novo despacho; envio anterior identificado como em confirmação e reconciliado |
| Dois consultores assumem simultaneamente | Uma atribuição consistente; conflito explicado ao segundo |
| Responsável muda com rascunho aberto | Rascunho preservado; envio revalida acesso |
| Webhook duplicado ou fora de ordem | Sem mensagem duplicada ou regressão indevida de estado |
| Conexão em tempo real cai e volta | Reconciliação recupera alterações sem perder contexto |
| Concluir enquanto chega mensagem nova | Conflito detectado; mensagem nova não é escondida |
| Usuário sem permissão tenta endpoint direto | Operação negada no servidor |
| Busca/exportação/contadores entre tenants | Nenhuma exposição cruzada |
| Calendário, primeira resposta e porcentagens | Resultados dos exemplos numéricos e limites de período corretos |
| Registros sem histórico suficiente | Cobertura explícita; nenhum valor histórico inventado |
| Filtro e exportação equivalentes | Mesma população, autorização e cálculo |

Teste também horários fora do expediente, feriado, mudança de fuso e dia de transição de horário de verão quando o calendário permitir. Se a política suportar turnos noturnos, inclua um caso que atravesse meia-noite.

### Validação visual e de uso

Execute a aplicação. Capture as telas 01–12 nas dimensões de referência e compare com os prints anexados: composição, proporções, densidade, tipografia, cores, bordas, estados e posição das ações. Corrija diferenças que mudem a hierarquia ou a facilidade de uso. Não basta compilar.

Valide os fluxos completos: encontrar uma pendência, responder, agendar retorno, retomar contato, transferir, assumir da IA e investigar uma falha. Use teclado e viewport móvel nos caminhos principais. Verifique que tabelas, drawers, menus e composer não se sobrepõem nem cortam ações.

Para cada tela, confira carregando, vazia, com dados, erro, sem permissão e atualização em tempo real quando aplicável. Nenhum botão aparente deve ser uma ação vazia. Uma dependência realmente indisponível deve ser identificada com mensagem específica e sem fingir execução.

Execute os comandos de qualidade disponíveis e pertinentes: formatação/lint, verificação de tipos, testes direcionados e build. Amplie testes somente para cobrir risco concreto ou gate do projeto. Registre o que rodou e os resultados reais; não afirme validar navegador, provedor ou produção se não teve acesso.

## 14. Entrega final esperada

Ao terminar, apresente:

- Telas implementadas e resumo dos principais fluxos funcionais.
- Mudanças de dados/API, migrações e variáveis de ambiente necessárias, sem valores secretos.
- Definições implementadas para filas, primeira resposta, retornos e estado da IA.
- Testes e comandos executados, com resultados e eventuais limitações concretas.
- Screenshots da aplicação implementada para comparação com o handoff.
- Passos de execução local e de aplicação das migrações no ambiente apropriado.
- Dependências externas restantes, se houver, sem confundi-las com funcionalidades concluídas.

Não declare a reformulação concluída se apenas algumas telas foram desenhadas, se as filas usam lógica inconsistente ou se ações importantes só mostram um toast. O objetivo é que um consultor possa conduzir o atendimento inteiro e que o supervisor consiga localizar e resolver as pendências com dados confiáveis.

Comece pelo levantamento do repositório e avance para a implementação.
