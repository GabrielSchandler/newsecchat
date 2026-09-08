# NewSec Chat

Central de atendimento de WhatsApp com atendimento humano, inteligência
artificial e automações.

Uma pessoa manda mensagem para um número da empresa. A conversa aparece
numa caixa de entrada. A IA responde, entende o motivo do contato, coleta
o que precisa e encaminha para o departamento certo. Quando um atendente
assume, **a IA para de responder na hora** — e só volta se alguém devolver
a conversa para ela, de propósito.

> **É a sua primeira vez aqui e você não é programador?**
> Vá direto para **[OWNER_SETUP_GUIDE.md](OWNER_SETUP_GUIDE.md)**. Ele
> explica clique a clique o que fazer.

---

## O que o sistema faz

**Atendimento**
- Caixa de entrada com filtros por situação e por departamento
- Assumir, transferir, encerrar, reabrir e devolver para a IA
- Notas internas que o cliente não vê
- Texto, imagem, áudio (transcrito), vídeo e documento
- Atualização em tempo real, sem apertar F5

**Inteligência artificial**
- Agente configurável por organização: persona, tom, regras, limitações
- Coleta os dados do negócio conversando, sem virar formulário
- Memória do contato e resumo que evoluem a cada conversa
- Triagem: entende o assunto e escolhe o departamento
- Horário de atendimento próprio
- Configuração versionada — nada entra no ar sem alguém publicar

**Contatos**
- Campos personalizados definidos por cada empresa
- Etiquetas, responsável, departamento, histórico completo
- Opt-out de campanha respeitado no momento do envio

**Campanhas**
- Envio espaçado, com janela de horário e limite diário
- Variáveis na mensagem e variações para teste A/B
- Repique: o lead responde, a IA retoma com o histórico e qualifica

**Integrações**
- Google Sheets: importa leads de planilha sem duplicar linha
- Evolution API para o WhatsApp, trocável por outro provedor

**Gestão**
- Painel com números reais (sem valor de exemplo)
- Papéis: proprietário, administrador, supervisor, atendente
- Auditoria de tudo que é relevante
- Isolamento de dados entre organizações aplicado no banco

---

## Como está montado

```
   Cliente no WhatsApp
          │
   ┌──────▼───────┐
   │ Evolution API│  (VPS, Docker)
   └──────┬───────┘
          │ webhook
   ┌──────▼──────────────────────┐
   │  Next.js na Vercel          │  autentica, deduplica,
   │  /api/webhooks/evolution    │  grava e enfileira
   └──────┬──────────────────────┘
          │
   ┌──────▼──────┐        ┌─────────────────┐
   │    Redis    │◄──────►│    Worker       │  (VPS, Docker)
   │   (fila)    │        │  processa tudo  │
   └─────────────┘        └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │    Supabase     │  banco + auth + arquivos
                          │  (RLS por org)  │
                          └─────────────────┘
```

**Por que dividido assim.** A Vercel liga o servidor quando alguém abre
uma página e desliga depois — ótimo para o site, impossível para quem
precisa segurar conexão com o WhatsApp e processar fila. Por isso a
Evolution, o Redis e o worker ficam numa VPS.

---

## Tecnologias

| Camada | O que é usado |
| --- | --- |
| Interface | Next.js 15, React 18, TypeScript, Tailwind |
| Banco | PostgreSQL no Supabase, com RLS |
| Autenticação | Supabase Auth |
| Arquivos | Supabase Storage (bucket privado) |
| Fila | BullMQ sobre Redis |
| WhatsApp | Evolution API v2 (por trás de um adapter) |
| IA | OpenAI (por trás de um adapter) |
| Testes | Vitest |

Evolution e OpenAI são tratadas como fornecedores substituíveis: nenhum
arquivo fora de `lib/provedores/` sabe que elas existem.

---

## Estrutura das pastas

```
app/
  (painel)/            telas internas (exigem login)
    atendimento/       a central de conversas
    painel/            indicadores
    contatos/          base de contatos
    campanhas/         disparo e repique
    ia/                configuração, versões e análise
    integracoes/       Google Sheets
    configuracoes/     canais, usuários, departamentos, campos, auditoria
  api/
    webhooks/evolution/[segredo]/   entrada das mensagens
    integracoes/google/retorno/     retorno do OAuth
  entrar/ comecar/ convite/         fora do painel

lib/
  nucleo/        regras puras e testáveis (estados, telefone, idempotência)
  provedores/    adapters: mensageria, IA, transcrição, armazenamento
  ia/            prompt, contexto e a decisão da IA
  servicos/      conversas e envio
  filas/         BullMQ e o modo em memória
  supabase/      clientes (usuário e serviço)

trabalhador/     o worker e seus processadores
supabase/        migrações SQL
testes/          Vitest
componentes/     interface
```

---

## Rodando na sua máquina

**Pré-requisitos:** Node.js 20 ou mais novo, e um projeto no Supabase.

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env.local     # Windows: Copy-Item .env.example .env.local
# preencha as variáveis do Supabase — ver OWNER_SETUP_GUIDE.md, seção 1

# 3. Criar as tabelas
npm run banco:aplicar

# 4. Subir
npm run dev
```

Abra <http://localhost:3000>, crie sua conta e monte a organização.

Para testar sem WhatsApp de verdade: crie um canal com o provedor
**Simulado** e coloque `FILA_EM_MEMORIA=true` no `.env.local`.

### Com Redis e Evolution locais

```bash
docker compose up -d redis evolution
```

Depois troque no `.env.local`:

```
REDIS_URL=redis://localhost:6379
FILA_EM_MEMORIA=false
EVOLUTION_API_URL=http://localhost:8080
```

E rode o worker numa segunda janela do terminal:

```bash
npm run trabalhador
```

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe a aplicação para desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build de produção |
| `npm run trabalhador` | Sobe o worker das filas |
| `npm run banco:aplicar` | Aplica as migrações no Supabase |
| `npm run banco:montar` | Junta as migrações num arquivo só |
| `npm run verificar` | Confere os tipos (TypeScript) |
| `npm run lint` | Confere o estilo do código |
| `npm run teste` | Roda os testes |
| `npm run qualidade` | lint + tipos + testes + build |

Todos rodam na **pasta do projeto**.

---

## Testes

```bash
npm run teste
```

São 112 testes que rodam sem nenhuma configuração, cobrindo:

- a máquina de estados do handoff IA ↔ humano
- as chaves de idempotência (mensagem, webhook, campanha, planilha)
- normalização de telefone, incluindo o nono dígito
- janela de envio de campanha com fuso horário
- leitura do webhook da Evolution, inclusive com carga corrompida
- filtro de segredos no log e limitador de taxa

Mais **16 testes de banco** que provam o isolamento entre organizações e
a corrida do "assumir conversa". Eles precisam de um banco de verdade: se
`SUPABASE_DB_URL` não estiver preenchida, são **pulados com aviso** — e o
relatório diz isso, em vez de fingir que passaram.

```bash
# Com SUPABASE_DB_URL preenchida no .env.local:
npm run teste
```

---

## Deploy

**Site (Vercel):** ligue o repositório, preencha as variáveis de ambiente
e faça o deploy. Cada `git push` no `main` publica.

**Serviços (VPS):**

```bash
docker compose up -d
```

O passo a passo completo, com o que contratar e onde clicar, está em
[OWNER_SETUP_GUIDE.md](OWNER_SETUP_GUIDE.md).

---

## Segurança

- Isolamento entre organizações por RLS, com o filtro no banco e não no
  código da tela
- Chave de serviço só no servidor e no worker, nunca no navegador
- Segredo do webhook fora do alcance do navegador (privilégio de coluna)
- Webhook autenticado pelo segredo do canal, com deduplicação
- Log sem chaves, tokens e senhas
- Limitador de taxa no login, no cadastro e no webhook
- Retenção de 30 dias para o evento cru de webhook (LGPD, minimização)

O que ainda falta está listado em
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

---

## Documentos

| Arquivo | Para quem |
| --- | --- |
| [OWNER_SETUP_GUIDE.md](OWNER_SETUP_GUIDE.md) | O dono. Passo a passo de tudo que depende dele |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | O que funciona, o que falta e por quê |
| [DECISOES-TECNICAS.md](DECISOES-TECNICAS.md) | Quem for mexer no código |
