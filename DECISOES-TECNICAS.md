# Decisões técnicas

Registro das escolhas que moldaram a aplicação e do porquê de cada uma.
Serve para quem for mexer no código depois (inclusive eu mesmo, daqui a
seis meses) entender o que foi decidido de propósito e o que é só o jeito
que ficou.

---

## 1. Não usar o Chatwoot

**Decisão:** construir a central de atendimento na própria aplicação, sem
Chatwoot.

**O que foi avaliado.** O Chatwoot Community é maduro e entrega de graça
uma caixa de entrada pronta, atribuição, etiquetas e times. Numa lista de
funcionalidades, ele cobre boa parte do que este produto precisa.

**Por que não.** Quatro razões, em ordem de peso:

1. **A regra central do produto exige um dono único do estado.** "Quando
   um humano assume, a IA para" só é garantia se existir UM lugar que
   decide isso, sob trava de banco. Com o Chatwoot, o estado da conversa
   viveria lá e a decisão da IA viveria aqui — duas fontes de verdade
   sincronizadas por webhook, com atraso entre elas. É exatamente a
   janela em que IA e humano respondem juntos, que é o defeito que o
   produto promete não ter.

2. **O isolamento entre empresas precisa ser nosso.** A separação de
   dados é aplicada por RLS no nosso Postgres. O Chatwoot tem o modelo de
   contas dele, com regras próprias. Manter as duas alinhadas seria mais
   uma coisa que pode sair de sincronia — e essa é a que não pode falhar.

3. **Manutenção que sobra para o dono.** O Chatwoot é Ruby on Rails, com
   Sidekiq, Postgres próprio e migrações próprias. Somando à Evolution
   API e ao Redis, o dono passaria a administrar três bancos e dois
   ecossistemas. Este produto é vendido para quem não tem equipe de
   infraestrutura.

4. **A interface teria de ser feita mesmo assim.** A central precisa
   mostrar estado da IA, memória do contato, campos coletados, resumo e
   origem de campanha — nada disso existe no Chatwoot. Sobraria um fork,
   ou uma interface nossa em cima da API dele: o trabalho da interface,
   mais o custo de sincronizar.

**O que perdemos.** Recursos que o Chatwoot já tem e este produto ainda
não: respostas prontas, macros, relatórios de agente, CSAT, chat de site e
outros canais além do WhatsApp. Estão anotados como próximos passos em
`IMPLEMENTATION_STATUS.md`.

**Quando reconsiderar.** Se o produto precisar de muitos canais além do
WhatsApp (e-mail, Instagram, chat de site, Telegram), o Chatwoot volta a
compensar — ali o trabalho de integração se paga.

### Divisão de responsabilidades adotada

| Camada | Quem faz |
| --- | --- |
| Conexão com o WhatsApp, QR Code, envio bruto | **Evolution API** |
| Contato, conversa, mensagem, histórico | **Nossa aplicação** |
| Estado da conversa e handoff | **Nosso banco** (funções com trava) |
| IA, memória, coleta de dados, triagem | **Nossa aplicação** |
| Campanha, fila, repique | **Nossa aplicação** |
| Isolamento entre empresas | **Nosso banco** (RLS) |

A Evolution é tratada como fornecedor substituível: nenhum arquivo fora de
`lib/provedores/mensageria/evolution.ts` sabe que ela existe.

---

## 2. A garantia do handoff é do banco, não do código

**Decisão:** toda transição de estado passa por função PL/pgSQL com
`SELECT ... FOR UPDATE`.

**Por quê.** O caso real: um job de IA fica 4 segundos na fila; nesse
intervalo, um atendente clica em "Assumir". Se a IA conferisse o estado
em JavaScript antes de gravar, os dois teriam lido "IA" e os dois
gravariam. A trava dentro da transação elimina a janela.

`registrar_mensagem_ia()` faz as duas coisas — conferir o estado e gravar
a mensagem — na mesma transação. Se um humano assumiu, ela devolve `null`
e nada é enviado ao cliente. `testes/banco.teste.ts` prova isso com dois
processos concorrentes de verdade.

A máquina de estados também existe em TypeScript
(`lib/nucleo/estados.ts`), mas com outra função: decidir o que a interface
oferece. Ela não é a garantia — é a experiência.

---

## 3. Idempotência por chave determinística

**Decisão:** toda operação com efeito externo tem uma chave calculada a
partir dos dados, e o banco tem índice único sobre ela.

**Por quê.** Chave aleatória por tentativa não protege de nada: o retry
gera outra e o efeito acontece de novo. Determinística, a segunda
tentativa esbarra na constraint.

| Operação | Chave | Onde é única |
| --- | --- | --- |
| Webhook recebido | `provedor:instância:id` | `eventos_webhook` |
| Mensagem recebida | id da mensagem no provedor | `mensagens` |
| Resposta da IA | `ia:conversa:mensagem-gatilho` | `mensagens` |
| Envio de campanha | `campanha:id:contato` | `mensagens` + `contatos_campanha` |
| Envio manual | conversa + membro + texto + janela de 5 s | `mensagens` |
| Linha de planilha | id da linha, ou posição + hash | `linhas_planilha_processadas` |

O envio manual usa uma janela de 5 segundos: repetir a mesma frase em
seguida é clique duplo; repetir depois de meio minuto é intenção.

---

## 4. Fila em processo separado, nunca na Vercel

**Decisão:** BullMQ com Redis, consumido por um worker em container.

**Por quê.** Função serverless não segura conexão bloqueante com Redis e
pode congelar assim que a resposta HTTP sai. Um trabalho de IA leva
segundos; uma campanha leva horas. Nada disso cabe no modelo da Vercel.

O webhook faz só o mínimo — autentica, deduplica, grava, enfileira,
responde. Processar dentro da resposta HTTP faria o provedor estourar o
tempo limite e reentregar, multiplicando o problema justamente quando o
sistema já está em dificuldade.

**Rede de proteção.** Se o Redis cair, o evento já está gravado em
`eventos_webhook` com status `RECEBIDO`, e a varredura do worker (a cada
minuto) o recupera. Sem isso, uma queda de dez minutos deixaria mensagens
de cliente sem resposta para sempre — e ninguém saberia.

**Fila em memória** existe só para desenvolvimento, e se recusa a ligar
com `NODE_ENV=production`.

---

## 5. Saída estruturada da IA, não texto livre

**Decisão:** a IA devolve um objeto JSON com esquema fixo (resposta,
dados coletados, memórias, transferência, confiança), conferido com Zod
antes de virar ação.

**Por quê.** Interpretar frase livre com expressão regular para descobrir
se a IA "quis transferir" é frágil e falha em silêncio. Com esquema
estrito, a decisão chega pronta e a aplicação só executa. A conferência
com Zod existe porque modelo obedece *quase* sempre — e "quase" é o
motivo de a segunda checagem existir.

**Regras que não vêm da configuração do cliente.** Não inventar, não
repetir pergunta, não prometer, não se passar por humano quando
perguntado. Ficam no código (`lib/ia/prompt.ts`) porque são propriedades
do produto: um cliente pode ajustar o tom, não pode desligar a honestidade
do atendimento.

---

## 6. A IA não altera o próprio prompt

**Decisão:** análise gera sugestão → humano aprova → nasce um rascunho →
humano publica.

**Por quê.** É a diferença entre uma ferramenta que melhora e uma que
deriva sozinha. O que roda em produção é sempre uma versão com nome de
quem aprovou e data.

Detalhe importante: aprovar uma sugestão **acrescenta** o texto ao campo,
não substitui. Sugestão de IA sobrescrevendo instrução escrita por gente
apagaria conhecimento acumulado.

---

## 7. Tipos do banco escritos à mão

**Decisão:** `lib/tipos-banco.ts` é mantido à mão, não gerado pelo CLI do
Supabase.

**Por quê.** O gerador precisa de um banco no ar, e este arquivo precisa
existir antes de qualquer banco existir. É ele que faz `npm run verificar`
acusar uma coluna escrita errado numa consulta, em vez de o erro aparecer
em produção.

**O custo:** ao mexer numa migração, é preciso ajustar aqui também. É a
única disciplina que o arquivo exige.

**Detalhe que custou tempo:** os tipos precisam ser `type`, não
`interface`. Interface não recebe assinatura de índice implícita, o
cliente do Supabase exige `Record<string, unknown>`, e o resultado é toda
consulta virar `never` — com dezenas de erros que não apontam para a
causa.

---

## 8. Consultas separadas em vez de `select` aninhado

**Decisão:** na central, uma consulta por tabela, com a junção feita em
JavaScript.

**Por quê.** Como os tipos são escritos à mão, eles não descrevem os
relacionamentos do PostgREST. Um `select('*, contatos(*)')` voltaria sem
tipo e obrigaria a converter na marra em cada ponto. Com listas de no
máximo algumas dezenas de linhas, quatro consultas indexadas custam menos
que perder a checagem de tipo da tela inteira.

**Quando revisar:** se a lista passar a carregar centenas de linhas por
vez, vale trocar por uma view no banco, tipada uma vez só.

---

## 9. Vermelho é acento; a cor de ação é o verde-petróleo

**Decisão:** o vermelho da marca fica em erro, alerta e destaque. Botão de
ação é `produto-700`.

**Por quê.** O operador passa o dia inteiro nesta tela. Um vermelho em
cada linha vira ruído e some justamente quando precisa chamar atenção —
numa falha de envio, num canal desconectado.

A barra lateral é escura (a marca) e a área de trabalho é clara: o escuro
fica onde se navega, o claro onde se lê texto o dia inteiro.

---

## 10. Segredo do webhook fora do alcance do navegador

**Decisão:** privilégio revogado na coluna `canais.segredo_webhook`; a URL
completa só sai por função que confere o papel.

**Por quê.** A política de leitura de `canais` libera a linha para
qualquer membro da organização, e a linha carregava o segredo. Um
atendente com ele em mãos conseguiria forjar eventos de webhook e injetar
mensagens falsas na própria operação. Não é vazamento entre empresas, mas
é privilégio que o papel não deveria ter.

RLS decide **quais linhas**; privilégio de coluna decide **quais colunas**.
Como um `GRANT` de tabela vale para todas as colunas, foi preciso revogar
o da tabela e conceder coluna a coluna.

---

## 11. Convite por link, não por e-mail

**Decisão:** o sistema gera o link do convite e o gestor repassa.

**Por quê.** Enviar e-mail exigiria contratar e configurar um serviço de
envio, com domínio verificado, SPF e DKIM — mais uma coisa para o dono
manter. E um "convite enviado" que cai no spam é pior que um link na mão:
o gestor acha que fez, a pessoa nunca recebe, e ninguém descobre.

**Quando revisar:** quando o produto tiver muitos clientes, o envio
automático passa a valer a pena.

---

## 12. Variações de mensagem são para teste A/B, não para evasão

**Decisão:** a variação é escolhida de forma determinística pelo id do
contato.

**Por quê.** Existem duas razões possíveis para variar a mensagem:
personalizar e medir, ou escapar de detecção de spam. A segunda não é
função deste produto. A escolha determinística deixa isso explícito: o
mesmo contato recebe sempre o mesmo texto, o retry não muda o que ele já
recebeu, e a comparação entre variações continua honesta.

O que existe para proteger o número é outra coisa, e é legítimo: intervalo
entre envios, janela de horário, limite diário e opt-out conferido na hora
do envio.

---

## 13. Prevenções contra dado falso na tela

**Decisão:** nenhum número da interface vem de valor de exemplo. Sem
dados, o número é zero e a tela diz por quê.

**Por quê.** Um painel que mostra "127 atendimentos" num sistema recém
instalado destrói a confiança em tudo mais que ele mostrar depois.

Na mesma linha: a leitura de imagem descreve o que o arquivo **aparenta**
conter e nunca afirma autenticidade de documento — isso não é verificável
por imagem, e afirmar seria mentir para o atendente.

---

## 14. Marca do produto

Este sistema é vendido sob a marca **NewSec**, junto com o CRM e o Focus.
Nenhuma peça voltada ao cliente pode ligá-lo à empresa que o desenvolve —
o comprador é do mesmo ramo, e perceber que contrata software de um
concorrente derruba a venda antes da demonstração.

Vale também a regra da família: em material comercial não se usa a palavra
"multiempresa" nem nada que a insinue. O argumento para o cliente é
**ambiente exclusivo da sua empresa**, com isolamento aplicado no banco.

Esta documentação é interna e técnica — por isso fala de organizações e
RLS abertamente. Material de venda, não.
