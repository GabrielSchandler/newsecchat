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
