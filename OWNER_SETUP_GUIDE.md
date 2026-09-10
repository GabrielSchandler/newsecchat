# Guia do proprietário — o que só você pode fazer

Este documento é para você, dono do sistema. Ele lista **tudo que depende
de uma conta, um cartão ou um clique seu** — nada aqui pode ser feito por
código.

Cada seção segue sempre a mesma estrutura:

> **O que fazer** · **Por que** · **Onde entrar** · **Onde clicar** ·
> **O que copiar** · **Onde colar** · **Qual comando rodar** ·
> **Como saber se funcionou**

Você não precisa entender de programação. Precisa seguir na ordem.

---

## Antes de começar

### O que você vai precisar

| Item | Custo aproximado | Obrigatório? |
| --- | --- | --- |
| Conta no Supabase (banco de dados) | Grátis para começar | **Sim** |
| Conta na Vercel (hospedar o site) | Grátis para começar | **Sim** |
| Uma VPS (servidor ligado 24h) | R$ 30–60/mês | **Sim** |
| Conta na OpenAI (a IA) | Pago por uso, ~R$ 0,02 por conversa | Não* |
| Conta no Google Cloud (planilhas) | Grátis | Não |
| Um domínio (ex.: chat.suaempresa.com.br) | ~R$ 40/ano | Recomendado |

\* Sem a OpenAI o sistema funciona: toda conversa vai direto para um
atendente humano. Nada fica sem resposta por causa disso.

### Por que preciso de uma VPS se já tenho a Vercel?

A Vercel é ótima para o **site** — ela liga o servidor quando alguém abre
uma página e desliga logo depois. Só que três coisas deste sistema
precisam ficar ligadas **o tempo todo**:

1. a conexão com o WhatsApp (Evolution API);
2. a fila que processa as mensagens (Redis);
3. o programa que responde as mensagens (o *worker*).

Nenhuma dessas três funciona num servidor que desliga. Por isso elas ficam
na VPS, e só o site fica na Vercel.

### Ordem recomendada

```
1. SUPABASE  ─────►  2. RODAR AS MIGRAÇÕES  ─────►  3. TESTE LOCAL
                                                          │
4. VPS  ─────►  5. REDIS + EVOLUTION  ─────►  6. WORKER    │
                                                          │
7. VERCEL  ─────►  8. DOMÍNIO  ─────►  9. CONECTAR WHATSAPP
                                                          │
                              10. OPENAI  ─────►  11. GOOGLE SHEETS
```

Dá para parar depois do passo 3 e já ver o sistema funcionando na sua
máquina (com um canal "simulado", que não manda nada para ninguém).

---

## 1. SUPABASE — o banco de dados

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Criar um projeto no Supabase e copiar três chaves.

### Por que
É onde ficam guardados os contatos, as conversas, as mensagens e as
configurações. Sem isso a aplicação nem abre.

### Onde entrar
[supabase.com](https://supabase.com) → **Start your project** → entre com
o GitHub ou com e-mail.

### Onde clicar
1. **New project**
2. **Name**: `newsec-chat`
3. **Database Password**: gere uma senha forte e **guarde num lugar
   seguro** — você vai precisar dela no passo 2 e ela não pode ser vista
   de novo depois.
4. **Region**: escolha **South America (São Paulo)**. Isso importa: cada
   consulta ao banco atravessa a distância entre o servidor e ele.
5. **Create new project** e espere uns 2 minutos.

### O que copiar
Com o projeto criado, vá em **Project Settings** (a engrenagem) → **API**:

| No Supabase aparece como | Copie para a variável |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

Depois clique no botão verde **Connect**, no topo do painel, e escolha
**Session pooler** — não a *Direct connection*, que só funciona por IPv6 e
falha na maioria das redes de escritório e no Docker do Windows. Copie o
texto e **troque `[YOUR-PASSWORD]` pela senha que você guardou**, sem
acrescentar nada depois de `/postgres`. Esse valor vai em `SUPABASE_DB_URL`.

> Se a senha tiver `@`, `:`, `/`, `#` ou `?`, ela quebra o endereço. Na
> dúvida, gere uma nova só com letras e números em Project Settings →
> Database → **Reset database password**.

> ⚠️ A chave `service_role` ignora todas as regras de segurança do banco.
> Ela nunca deve ser enviada por WhatsApp, colada em chat ou publicada.
> Se vazar, gere outra em Project Settings → API → **Reset**.

### Onde colar
Na pasta do projeto, copie o arquivo de exemplo e preencha:

```bash
# Windows (PowerShell), dentro da pasta do projeto:
Copy-Item .env.example .env.local
notepad .env.local
```

```bash
# Linux ou Mac:
cp .env.example .env.local
nano .env.local
```

### Como saber se funcionou
Faça o passo 2 abaixo. Se as migrações rodarem, a conexão está certa.

---

## 2. CRIAR AS TABELAS (migrações)

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Rodar um comando que cria todas as tabelas dentro do Supabase.

### Por que
O banco nasce vazio. Este comando cria as tabelas, os índices e as regras
de segurança que impedem uma empresa de ver os dados de outra.

### Qual comando rodar
Na pasta do projeto:

```bash
npm install
npm run banco:aplicar
```

### Resultado esperado

```
  aplicando    0001_base_organizacoes.sql ... ok
  aplicando    0002_canais.sql ... ok
  ...
  aplicando    0011_segredo_do_canal.sql ... ok

  Pronto. 11 migração(ões) aplicada(s).
```

### Se der erro de conexão
Alguma rede de empresa bloqueia a porta do banco. Nesse caso use o
navegador:

```bash
npm run banco:montar
```

Isso gera o arquivo `supabase/esquema-completo.sql`. Abra o Supabase →
**SQL Editor** → **New query** → cole o arquivo inteiro → **Run**.

### Como saber se funcionou
No Supabase, vá em **Table Editor**. Você deve ver as tabelas
`organizacoes`, `contatos`, `conversas`, `mensagens` e outras.

---

## 3. TESTE LOCAL — ver o sistema funcionando

**Status: você já consegue fazer sozinho**

### Qual comando rodar

```bash
npm run dev
```

Abra <http://localhost:3000> no navegador.

### O que fazer na tela
1. Clique em **Criar conta** e cadastre-se com seu e-mail.
2. Se o Supabase pedir confirmação por e-mail, confirme (olhe também o
   spam). Para desligar essa exigência enquanto testa: Supabase →
   **Authentication** → **Providers** → **Email** → desmarque *Confirm
   email*.
3. Dê um nome à sua empresa e escolha o modelo de campos.
4. Você cai na tela de **Canais de WhatsApp**.

### Como testar sem WhatsApp de verdade
Em **Configurações → Canais**, clique em **Novo canal** e escolha o
provedor **Simulado**. Ele não envia nada para ninguém — serve para você
navegar pelo sistema enquanto a Evolution API não está pronta.

Para a fila funcionar sem Redis durante o teste, coloque no `.env.local`:

```
FILA_EM_MEMORIA=true
```

> Isso vale **só para testar na sua máquina**. Em produção o sistema
> recusa essa opção, porque mensagens ficariam se perdendo.

---

## 4. VPS — o servidor que fica ligado

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Contratar um servidor Linux pequeno.

### Por que
Ver a explicação em *"Por que preciso de uma VPS"*, no começo do guia.

### Onde contratar
Qualquer uma serve. Exemplos com preço parecido:

- [Hostinger VPS](https://www.hostinger.com.br/servidor-vps) — em português
- [Contabo](https://contabo.com) — mais barato
- [DigitalOcean](https://www.digitalocean.com) — mais conhecido

### O que escolher
- **Sistema**: Ubuntu 22.04 ou 24.04
- **Memória**: no mínimo **4 GB** (a Evolution API sozinha usa quase 2 GB)
- **Disco**: 50 GB
- **Local**: Brasil, se houver

### O que copiar
O endereço IP do servidor e a senha de acesso (`root`).

### Como entrar no servidor

```bash
ssh root@SEU-IP-AQUI
```

No Windows sem SSH instalado, use o [PuTTY](https://www.putty.org) ou o
console pelo painel da hospedagem.

### Instalar o Docker (uma vez só)
Cole isto no terminal do servidor:

```bash
curl -fsSL https://get.docker.com | sh
```

### Como saber se funcionou

```bash
docker --version
```

Deve aparecer algo como `Docker version 27.x.x`.

---

## 5. REDIS E EVOLUTION API — no servidor

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Subir os serviços dentro do servidor.

### Qual comando rodar
No servidor:

```bash
# Baixa o projeto
git clone SEU-REPOSITORIO newsecchat
cd newsecchat

# Cria o arquivo de configuração
cp .env.example .env.local
nano .env.local
```

Preencha no `.env.local` do servidor:

```
NEXT_PUBLIC_SUPABASE_URL=          (o mesmo do passo 1)
NEXT_PUBLIC_SUPABASE_ANON_KEY=     (o mesmo do passo 1)
SUPABASE_SERVICE_ROLE_KEY=         (o mesmo do passo 1)
SUPABASE_DB_URL=                   (o mesmo do passo 1)

NEXT_PUBLIC_URL_APLICACAO=https://chat.suaempresa.com.br
EVOLUTION_API_URL=http://SEU-IP:8080
EVOLUTION_API_KEY=                 (invente uma senha longa e guarde)
REDIS_URL=redis://redis:6379
```

Para gerar a `EVOLUTION_API_KEY`:

```bash
openssl rand -hex 24
```

Salve (`Ctrl+O`, `Enter`, `Ctrl+X`) e suba tudo:

```bash
docker compose up -d
```

### Como saber se funcionou

```bash
docker compose ps
```

Os três serviços (`redis`, `evolution`, `trabalhador`) devem aparecer como
`running`.

Para ver o worker trabalhando:

```bash
docker compose logs -f trabalhador
```

Deve aparecer uma linha com `"mensagem":"Worker iniciado"`.

> ⚠️ **Não abra a porta 8080 para a internet.** No `docker-compose.yml`
> ela está publicada só em `127.0.0.1` de propósito: uma Evolution API
> exposta é invadida em horas, e quem a controla manda mensagem em nome do
> seu número.

---

## 6. VERCEL — publicar o site

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Ligar o repositório do GitHub à Vercel.

### Onde entrar
[vercel.com](https://vercel.com) → entre com o GitHub.

### Onde clicar
1. **Add New** → **Project**
2. Escolha o repositório do NewSec Chat → **Import**
3. **Framework Preset**: precisa estar em **Next.js**
4. **Root Directory**: deixe na raiz (`./`)
5. Abra **Environment Variables** e adicione, uma a uma:

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | do passo 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do passo 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | do passo 1 |
| `NEXT_PUBLIC_URL_APLICACAO` | `https://chat.suaempresa.com.br` |
| `EVOLUTION_API_URL` | `http://SEU-IP:8080` |
| `EVOLUTION_API_KEY` | a que você inventou no passo 5 |
| `REDIS_URL` | `redis://:senha@SEU-IP:6379` (ver aviso abaixo) |
| `OPENAI_API_KEY` | do passo 9, se já tiver |

6. **Deploy**

> ⚠️ **Sobre o `REDIS_URL` na Vercel**: para a Vercel alcançar o Redis da
> sua VPS, o Redis precisaria estar aberto na internet — o que é perigoso.
> Duas saídas melhores: (a) usar um Redis gerenciado, como
> [Upstash](https://upstash.com), que tem plano grátis e funciona bem com
> a Vercel; ou (b) proteger o Redis da VPS com senha e liberar por firewall
> só o IP da Vercel. A opção (a) é a mais simples e a recomendada.

### Como saber se funcionou
A Vercel mostra um endereço `.vercel.app`. Abra: a tela de login deve
aparecer.

---

## 7. DOMÍNIO E DNS

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO**

### O que fazer
Apontar `chat.suaempresa.com.br` para a Vercel.

### Por que
O endereço `.vercel.app` funciona, mas o cliente que receber um link com
ele não reconhece a sua empresa. E o webhook do WhatsApp precisa de um
endereço estável.

### Onde clicar
1. Na Vercel: **Settings** → **Domains** → digite `chat.suaempresa.com.br`
   → **Add**
2. A Vercel mostra um registro para criar. Vá no painel do seu domínio
   (Registro.br, GoDaddy, Cloudflare…) e crie:

| Tipo | Nome | Valor |
| --- | --- | --- |
| CNAME | `chat` | `cname.vercel-dns.com` |

3. Espere. Costuma levar de 10 minutos a algumas horas.

### Depois que o domínio responder
Atualize **nos dois lugares**:

- Na Vercel: `NEXT_PUBLIC_URL_APLICACAO` = `https://chat.suaempresa.com.br`
- No `.env.local` da VPS: a mesma coisa, e depois
  `docker compose restart trabalhador`

### Como saber se funcionou
Abra `https://chat.suaempresa.com.br`. Tem que carregar com o cadeado.

---

## 8. CONECTAR O WHATSAPP

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO — precisa do celular na mão**

### O que fazer
Ler um QR Code com o celular que tem o número.

### Antes de começar, confira
- [ ] `NEXT_PUBLIC_URL_APLICACAO` está com o endereço **público**, não com
      `localhost`. Se estiver localhost, **nenhuma mensagem vai chegar**.
- [ ] A Evolution API está rodando (`docker compose ps`).
- [ ] O worker está rodando.

### Onde clicar
1. Entre no sistema → **Configurações** → **Canais de WhatsApp**
2. **Novo canal**
3. Nome: `Comercial principal` (ou o que fizer sentido)
4. Provedor: **Evolution API**
5. **Cadastrar canal**
6. Na linha que apareceu, clique em **Conectar**

### No celular
1. Abra o WhatsApp
2. **Configurações** → **Aparelhos conectados**
3. **Conectar um aparelho**
4. Aponte para o QR Code da tela

### Como saber se funcionou
A tela muda sozinha para **Conectado** em alguns segundos. Se não mudar,
clique em **Atualizar**.

**O teste que vale**: peça a alguém para mandar uma mensagem no número. Em
poucos segundos ela tem que aparecer em **Atendimento**.

### Se a mensagem não chegar
Nesta ordem:

1. `NEXT_PUBLIC_URL_APLICACAO` está com o endereço público? (É o erro mais
   comum.)
2. O worker está de pé? `docker compose logs -f trabalhador`
3. O Redis está de pé? `docker compose ps`
4. Em **Configurações → Canais**, clique em **Mostrar endereço** e abra
   aquele endereço no navegador. Deve responder
   `{"ok":true,"mensagem":"Webhook ativo para o canal ..."}`.

> ⚠️ **Números novos são banidos com facilidade.** Um chip comprado hoje
> que comece a mandar dezenas de mensagens amanhã costuma ser bloqueado.
> Use um número com histórico e comece devagar.

---

## 9. OPENAI — a inteligência artificial

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO — opcional**

### O que fazer
Criar uma chave de API e colocar créditos.

### Por que
É o que faz a IA conversar, transcrever áudio e ler imagem. **Sem isso o
sistema funciona**: toda conversa vai direto para um atendente.

### Onde entrar
[platform.openai.com](https://platform.openai.com) — atenção: é diferente
do ChatGPT que você usa no dia a dia, e a assinatura do ChatGPT Plus
**não** serve aqui.

### Onde clicar
1. **Settings** → **Billing** → **Add payment method**
2. Adicione um crédito inicial (US$ 10 já dá para bastante conversa)
3. **API keys** → **Create new secret key**
4. Dê o nome `newsec-chat` → **Create**

### O que copiar
A chave aparece **uma única vez** e começa com `sk-`. Copie agora.

### Onde colar
- Na Vercel: variável `OPENAI_API_KEY`
- No `.env.local` da VPS: a mesma, depois
  `docker compose restart trabalhador`

### Quanto custa
Com o modelo padrão (`gpt-4o-mini`), uma conversa de atendimento custa em
torno de **2 a 5 centavos de real**. Mil conversas por mês ficam por volta
de R$ 30. Você acompanha em **Usage** no painel da OpenAI, e pode definir
um teto em **Settings → Limits**.

### Como saber se funcionou
1. Vá em **IA → Configuração**
2. Preencha **O que a empresa faz**, **Serviços** e **Base de conhecimento**
3. **Salvar rascunho** → **Publicar rascunho**
4. Mande uma mensagem de um número qualquer para o WhatsApp conectado
5. A IA responde em alguns segundos, e a conversa aparece como *IA
   atendendo*

> ⚠️ Enquanto não houver uma versão **publicada**, a IA não atende: a
> conversa vai para a fila humana. Isso é de propósito — melhor um
> atendente do que uma IA sem instrução nenhuma.

---

## 10. GOOGLE SHEETS — importar leads de planilha

**Status: AÇÃO NECESSÁRIA DO PROPRIETÁRIO — opcional**

### Onde entrar
[console.cloud.google.com](https://console.cloud.google.com)

### Onde clicar
1. Crie um projeto (**Select a project** → **New project**) chamado
   `newsec-chat`
2. **APIs e serviços** → **Biblioteca** → procure **Google Sheets API** →
   **Ativar**
3. Procure também **Google Drive API** → **Ativar**
4. **APIs e serviços** → **Tela de permissão OAuth**:
   - Tipo: **Externo**
   - Nome do app: `NewSec Chat`
   - E-mail de suporte: o seu
   - Em **Usuários de teste**, adicione o seu e-mail do Google
5. **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - Em **URIs de redirecionamento autorizados**, adicione **exatamente**:
     ```
     https://chat.suaempresa.com.br/api/integracoes/google/retorno
     ```
   - Para testar local, adicione também:
     ```
     http://localhost:3000/api/integracoes/google/retorno
     ```

### O que copiar
**ID do cliente** e **Chave secreta do cliente**.

### Onde colar

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://chat.suaempresa.com.br/api/integracoes/google/retorno
```

### Como saber se funcionou
**Integrações → Google Sheets** → **Conectar conta Google**. Depois de
autorizar, o selo tem que mudar para **conectada** e mostrar seu e-mail.

> O sistema pede permissão apenas de **leitura** de planilhas. Ele nunca
> escreve na sua conta Google.

---

## 11. CONVIDAR SUA EQUIPE

**Status: você já consegue fazer sozinho**

1. **Configurações** → **Usuários** → **Convidar**
2. Escolha o papel:

| Papel | O que pode fazer |
| --- | --- |
| **Atendente** | Atende conversas dos departamentos dele e as sem departamento |
| **Supervisor** | Vê toda a operação, campanhas e a IA; não mexe em configurações |
| **Administrador** | Configura canais, pessoas, departamentos e a IA |
| **Proprietário** | Tudo, inclusive criar e remover administradores |

3. Marque os departamentos da pessoa
4. **Gerar convite** → **copie o link** e mande para ela

> O sistema **não envia e-mail** — ele te dá o link para você repassar.
> Isso é proposital: enviar e-mail exigiria contratar um serviço de envio,
> e um "convite enviado" que nunca chega é pior que um link na mão.

---

## Rotina de manutenção

### Toda semana
- Olhe **Painel** e veja se há conversas paradas em *Aguardando humano*.
- Confira em **Configurações → Canais** se os números seguem conectados.

### Todo mês
- Veja o gasto da OpenAI em **Usage**.
- Rode **IA → Análise de atendimentos** e revise as sugestões.

### Quando atualizar o sistema
Na VPS:

```bash
cd newsecchat
git pull
docker compose up -d --build trabalhador
npm run banco:aplicar   # só se houver migração nova
```

A Vercel atualiza o site sozinha a cada `git push` no `main`.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Mensagem não chega | `NEXT_PUBLIC_URL_APLICACAO` com `localhost` | Trocar pelo endereço público e reiniciar |
| Mensagem não chega | Worker parado | `docker compose logs -f trabalhador` |
| Mensagem fica "pendente" | Redis fora do ar | `docker compose ps` |
| IA não responde | Nenhuma versão publicada | **IA → Configuração** → Publicar |
| IA não responde | `OPENAI_API_KEY` vazia ou sem crédito | Ver passo 9 |
| IA não responde | Um humano assumiu a conversa | É o comportamento correto; use **Devolver à IA** |
| QR Code não aparece | Evolution API fora do ar | `docker compose restart evolution` |
| Número desconectou sozinho | O WhatsApp derruba sessões antigas | Reconectar pelo QR Code |
| "Sem tempo real" na tela | Realtime desligado no Supabase | Supabase → Database → Replication → ativar para `conversas` e `mensagens` |
| Campanha não anda | Fora da janela de horário | Ver a janela na tela da campanha |
| Campanha não anda | Canal desconectado | Reconectar o número |

---

## O que NUNCA fazer

1. **Não publique a chave `service_role`.** Ela abre o banco inteiro.
2. **Não abra a porta do Redis para a internet sem senha.**
3. **Não coloque `FILA_EM_MEMORIA=true` em produção.** Mensagens se perdem.
4. **Não versione o `.env.local`.** Ele já está no `.gitignore`; mantenha.
5. **Não compre um chip novo para disparar campanha.** Ele é banido.
6. **Não aumente o limite diário de campanha de uma vez.** Suba aos poucos
   e observe.

---

## Quando pedir ajuda

Ao relatar um problema, mande junto:

1. **O que você fez**, clique a clique.
2. **O que esperava** e **o que aconteceu**.
3. O log do worker:
   ```bash
   docker compose logs --tail=100 trabalhador
   ```
4. Se for erro de tela, um print com a mensagem inteira.

O log já sai sem chaves e sem senhas — ele pode ser compartilhado.
