# Publicação da repaginação — 21/09/2026

## Endereço e código

- Site: https://newsecchat.vercel.app
- GitHub: https://github.com/GabrielSchandler/newsecchat (branch `main`).
- Implementação principal: commit `1781be2`, implantação Vercel confirmada com sucesso.
- Ajustes finais da ação Concluir e legibilidade do login estão nos commits posteriores desta entrega.
- Caminhos e comandos: `CONTINUAR-DESENVOLVIMENTO.md`.

## Banco e worker

As migrações 0015 a 0026 foram aplicadas juntas em transação de produção em 21/09/2026. A consulta posterior confirmou 26 migrações registradas. **Não é necessário rodar SQL manualmente para esta entrega.**

O worker foi substituído após pausa graciosa e reiniciou com IA e Evolution configuradas, sem reinícios inesperados na verificação. Imagem da entrega: `newsecchat-worker:redesign-20260921`. O servidor permanece em `/opt/newsecchat`.

O código anterior e a imagem anterior foram preservados no próprio servidor: `/opt/newsecchat-releases/20260921-pre-redesign/codigo.tgz` e `newsecchat-worker:pre-redesign-20260921`. Nenhum dump local de produção foi criado: a revisão automática de aprovação bloqueou tanto a exportação de dados como a de definições SQL. Isso não impediu a aplicação transacional já pré-validada.

## Verificações executadas

- 161 testes automatizados aprovados, incluindo testes com PostgreSQL 17 local e permissões RLS.
- Lint, TypeScript e build de produção.
- Navegador: fila e rascunho por conversa, inserção de resposta rápida sem envio automático, salvamento de resposta, reagendamento de retorno, transferência com histórico, passagem IA/humano, relatório filtrado, regras salvas, canais, usuários e perfil.
- Layout de atendimento conferido em 1440×900, 1280×800 e 390×844.
- Despacho real da aplicação contra canal SIMULADO local: primeiro envio ENVIADA, segundo IGNORADA, espera humana encerrada.
- Produção: login HTTP 200; rotas privadas redirecionam visitantes sem sessão para login; consultas das novas views e relatórios executam sob o papel existente SUPER_ADMIN. Não havia outros papéis ativos para repetir essa verificação em produção; restrições de consultor/supervisor foram testadas no banco local.

## Limites da verificação

Não foi enviada mensagem para cliente real. Entrega WhatsApp real depende da sessão do canal e da Evolution. O navegador de produção estava sem sessão de usuário: a navegação autenticada foi validada no ambiente local, e as consultas de produção foram verificadas separadamente, em modo somente leitura.

O `npm audit --omit=dev` identificou avisos preexistentes em dependências transitivas: PostCSS (ferramenta de CSS), UUID/Google APIs. Não houve atualização de versão principal de Next.js ou Google APIs nesta repaginação. A revisão/atualização dessas dependências continua sendo uma manutenção separada; esta entrega não constitui certificação de segurança nem garantia de ausência de falhas.

Métricas humanas antigas sem eventos suficientes ficam excluídas do cálculo e são identificadas na cobertura. Não usar dados ilustrativos dos mockups como indicadores reais.
