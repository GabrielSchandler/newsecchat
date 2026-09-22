# Continuação do NewSec Chat

Atualizado em 21/09/2026. Repaginação baseada nas 12 telas aprovadas pelo proprietário.

## Onde está o projeto

- Cópia de trabalho desta repaginação: `C:\Users\Useer\Documents\GitHub\GRSCRM\tmp\newsecchat-redesign`.
- Repositório remoto: https://github.com/GabrielSchandler/newsecchat
- Pasta principal, sincronizada ao final da publicação: `C:\Users\Useer\Documents\GitHub\newsecchat`.
- Interface publicada: https://newsecchat.vercel.app
- Worker de produção: `/opt/newsecchat`, no servidor existente. Configuração privada em `.env.local` no servidor.
- MazyOS é a memória operacional da empresa, não o código do Chat. Pasta: `C:\Users\Useer\OneDrive - 50.020.315 TATIANE MOREIRA DOS SANTOS\Área de Trabalho\PROJETOS\MazyOS`.

A pasta `tmp` acima contém um repositório Git completo; não a apague antes de confirmar que seus commits estão no remoto. Para outra máquina, clone o repositório remoto. Não copie `node_modules`, `.next` nem a configuração local de validação.

## Desenvolvimento

Node 22, npm, Next.js 15, React 18, Supabase/PostgreSQL e worker BullMQ. Execute `npm ci`, configure `.env.local` a partir de `.env.example` e use `npm run dev`. O worker usa `npm run trabalhador`. Nunca versione credenciais.

**Atenção:** o `.env.local` desta cópia de trabalho usa somente o ambiente fictício local (portas 55439–55441), não produção. O `node_modules` atual é uma junção para a cópia original; em outra pasta/máquina execute `npm ci`.

## Arquivos principais

- `app/(painel)/atendimento`: fila, conversa, composição e contexto.
- `componentes/operacao`: telas de gestão, perfil, retornos, respostas e assistente IA.
- `lib/operacao`: ações, consultas e calendário.
- `app/(painel)/configuracoes`: canais, regras e acesso.
- `supabase/migrations/0015_*.sql` até `0026_*.sql`: evolução desta entrega.
- `lib/servicos/envio.ts`, `lib/servicos/conversas.ts`, `lib/ia/conversar.ts`: proteção do fluxo entre IA e atendimento humano.
- `testes/operacao-banco.teste.ts`: regras operacionais, permissões e concorrência.

## Verificação

`npm run lint`, `npm run verificar`, `npm run teste`, `npm run build`.
Para executar também os testes de banco, forneça explicitamente `SUPABASE_DB_URL` apontando para banco **descartável de teste**. Nunca rode a suíte contra produção. Sem essa variável os testes de banco são ignorados.

Foram aprovados 161 testes com PostgreSQL local. A validação de navegador usa dados fictícios e canal SIMULADO. Os helpers `scripts/preparar-banco-local.mjs`, `scripts/cenario-local.mjs` e `scripts/gateway-local.mjs` são exclusivos de desenvolvimento. Não publique o gateway de autenticação local.

## Publicação e recuperação

A interface roda na Vercel; o worker roda no Docker da VPS e compartilha o código de `lib`. Atualize ambos ao modificar as regras de despacho. No servidor sempre use `docker compose --env-file .env.local`.

Antes da publicação foi preservada a imagem `newsecchat-worker:pre-redesign-20260921` e o código em `/opt/newsecchat-releases/20260921-pre-redesign/codigo.tgz`. Não houve exportação local de dados de clientes. Para alterações de esquema, use transação e o registro `migracoes_aplicadas`; não reaplique manualmente migrações já registradas. A reversão da interface/worker precisa ser coordenada com as funções SQL; não restaure versões isoladas durante despachos.

As métricas de espera humana têm cobertura prospectiva: registros antigos sem eventos necessários ficam fora dos indicadores e aparecem como cobertura incompleta. Confirmação automática e nota interna não contam como resposta humana. O teste com SIMULADO não comprova entrega em um WhatsApp real; essa operação depende da sessão do canal e do provedor.

O registro final da publicação, hash do commit e verificações está em `PUBLICACAO-2026-09-21.md` quando a publicação estiver concluída.

As seis imagens aprovadas e o prompt estão preservados em docs/referencias/newsec-chat. Use-os como referência visual, mantendo os dados reais e as regras de acesso.

## Atendimento e desempenho — 21/09/2026 (à tarde)

**Tela de Atendimento** — duas perguntas separadas, sempre visíveis: *de quem é a conversa?* (abas **Meu atendimento · Equipe · IA**, a IA só para supervisor, administrador e proprietário) e *o que falta fazer?* (**Novos · Não respondidos · Todos**). Vocabulário e regras em `lib/operacao/atendimento.ts`; lista em `app/(painel)/atendimento/lista-operacional.tsx`; consulta em `carregarAtendimento` (`lib/operacao/dados.ts`); contagens pela função SQL `atendimento_contagens` (migração **0027**).

- **Novo** = o cliente escreveu e ninguém visualizou (`nao_lidas > 0`). **Não respondido** = já visualizada e o cliente ainda espera uma resposta humana (`para_responder` e `nao_lidas = 0`; mensagem automática, nota interna e leitura não encerram a espera). Os dois não se sobrepõem. Isso **substitui** a definição de "Novos" do prompt de referência (que dizia "ainda não triadas").
- "Visualizada" é um estado da conversa, não de quem olha: só o responsável (ou qualquer pessoa, quando não há responsável) zera `nao_lidas` ao abrir. Um supervisor conferindo a conversa de um consultor não a tira de Novos dele.
- Os filtros da fila antiga (`responder`, `sem-responsavel`, `vencidos`, `apoio`, `encerradas`…) continuam valendo por link, porque a Supervisão e as Equipes apontam para eles; aparecem como um filtro extra que se remove com o X.
- Se a função `atendimento_contagens` ainda não existir no banco, a lista abre sem os números (não quebra).

**Desempenho** — medido num banco local com 1.200 conversas abertas e 168 mil mensagens, como SUPER_ADMIN (com RLS): a view `fila_operacional` levava ~17 s na lista, ~4,5 s na contagem exata e ~6 s em `fila_contagens`, **por renderização**. Causa: a política de leitura de `mensagens` (`pode_ver_conversa`) era avaliada em cada mensagem de cada conversa (48 mil vezes por consulta) porque a "última mensagem" ordena por `coalesce(enviado_em, criado_em)`, sem índice. A migração 0027 cria os índices (a regra da view não mudou): lista ~1,5 s, contagem ~0,25 s, contagens ~0,8 s. Junto:

- `lib/sessao.ts`: `getUser()` uma vez por renderização (antes: 4 a 5), e perfil/vínculo e organização/equipes em paralelo.
- `tempo-real.tsx`: recarga da página inteira agrupada (no máximo uma a cada 3 s); a primeira conexão não recarrega (antes cada conversa aberta recarregava a tela de novo logo após o clique); relógio de segurança lento com o tempo real conectado.
- Envio: a caixa de texto não trava mais (o envio segue em segundo plano), sem `revalidatePath` na ação (o cliente já atualiza), auditoria depois da resposta (`after`), consulta do canal em paralelo.
- Worker: `IDADE_MINIMA_MENSAGEM_MS` e `IDADE_MINIMA_EVENTO_MS` de 3 s para 0,5 s; varredura de mensagens e eventos a cada 1 s (`VARREDURA_RAPIDA_SEGUNDOS`, padrão antes 3); planilhas e campanhas num ciclo à parte de 30 s.

**Ordem de publicação:** (1) aplicar a migração 0027 (`npm run banco:aplicar`, precisa de `SUPABASE_DB_URL`); (2) push no `main` (Vercel); (3) atualizar o worker na VPS: copiar `trabalhador/principal.ts`, `lib/ambiente.ts` e `docker-compose.yml` para `/opt/newsecchat` e rodar `docker compose --env-file .env.local up -d --build trabalhador`. Se o `.env.local` da VPS definir `VARREDURA_RAPIDA_SEGUNDOS`, ele vale no lugar do novo padrão de 1 s.

**Testes:** `testes/atendimento-escopo.teste.ts` (regras puras) e `testes/atendimento-contagens.teste.ts` (banco; roda com `SUPABASE_DB_URL` de um banco descartável — a URL precisa conter `localhost`, não `127.0.0.1`, senão o teste liga SSL e falha). Não medido em produção: o ganho real depende do volume de conversas e da região da função na Vercel (hoje `iad1`, sem `vercel.json`; o banco está em São Paulo).
