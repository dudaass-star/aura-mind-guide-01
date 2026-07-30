# PIX Automático Bacen: diagnóstico corrigido e o que fazer

## Sua hipótese está quase certa — e os dados apontam algo mais simples

Você não acha essas recusas na Asaas porque **não são cobranças, são autorizações** (o consentimento de recorrência). Quando o consentimento não se completa, nenhuma cobrança é criada — logo, nada aparece em "Cobranças". Esses registros vivem em `/pix/automatic/authorizations`, que o painel não expõe de forma navegável. Nosso `asaas_pix_authorizations` é hoje a única visão completa.

E o padrão temporal mata a dúvida: **todas as 12 REFUSED foram marcadas exatamente ~30 minutos após a criação** (30:10, 30:19, 30:20, 30:28, 30:38, 30:49, 30:59, 31:01…). Trinta minutos é exatamente o TTL do nosso QR (`expirationSeconds = 1800`). Ou seja: não é o banco negando o débito automático — é o **QR expirando sem que o cliente conclua**. O cliente abriu o app, viu a tela de autorização de recorrência (a "caixinha") e não finalizou: desistiu, travou na dúvida, ou nem abriu.

As 3 que deram certo foram concluídas em 2, 6 e 117 minutos. Autorizações que o cliente completa, completam rápido.

A Nina é o caso extremo: 6 tentativas em dois dias, todas expiradas, e no fim pagou um PIX manual.

Então o problema real é **conversão da tela de autorização no app do banco**, não capacidade técnica.

## O segundo problema, que continua de pé

Para as 3 autorizações ACTIVE, as cobranças do ciclo seguinte estão como PIX comum `PENDING`, **sem `pixAutomaticAuthorizationId`**, e há duas já `OVERDUE` (Leandro 06/07, Felipe 30/06, Francisco 02/07). Nenhum débito automático confirmado até hoje: os únicos recebidos foram os pagamentos iniciais.

Duas cobranças vencem agora e servem de teste: **Felipe 30/07** (`pay_tf8bevjfskg3r6rq`) e **Francisco 02/08** (`pay_qm7po4aowq9lh8o0`).

## O que fazer

### 1. Instrumentar e enxergar (primeiro passo, sem risco)
- Tratar `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED` explicitamente no `webhook-asaas`, com log de erro e registro do motivo.
- Painel/consulta no Admin: autorizações criadas × ativadas × recusadas por dia, e cobranças de ciclo com/sem vínculo de autorização.
- Conferência direta contra a Asaas: uma leitura read-only de `/pix/automatic/authorizations` para confirmar, na fonte, que os 12 REFUSED constam lá com o mesmo status e capturar o motivo da recusa que a Asaas informa (campo de rejeição por PSP do pagador).

### 2. Recuperar quem é recusado (maior impacto em receita)
- Quando a autorização vira REFUSED, o checkout para de esperar e mostra na hora a alternativa (PIX avulso do mesmo valor ou cartão).
- Recuperação por e-mail/WhatsApp para quem foi recusado e não voltou (12 pessoas nos últimos 30 dias).

### 3. Ajustar a criação da autorização
- Enviar `retryPolicy` permitindo retentativa e `minLimitValue`, para que um débito que falhe possa ser tentado novamente em vez de morrer na primeira falha.
- Confirmar com o suporte da Asaas: (a) por que as autorizações voltam REFUSED com tanta frequência nessa conta; (b) por que as cobranças de ciclo das autorizações ACTIVE saem sem `pixAutomaticAuthorizationId` — sem esse vínculo o débito automático nunca dispara e o cliente sempre recebe QR manual.

### 4. Verificação do dia seguinte
- Rotina diária que compara vencimentos do dia anterior com pagamentos recebidos por débito automático e alerta quando o débito não disparou. É isso que responde de forma definitiva se o PIX Automático funciona nesta conta.

## Decisão que precisa ser sua

Com ~70% de recusa, o PIX Automático como **caminho padrão do mensal** custa vendas. Duas opções:

- **A) Manter como padrão** e implementar itens 1–4 (recupera o refugo, mas o funil segue sangrando até a Asaas responder).
- **B) Rebaixar temporariamente**: mensal volta a oferecer PIX avulso/cartão como padrão, com PIX Automático como opção secundária, até o item 4 comprovar que o débito dispara.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts`: `authStatusMap` sem a chave `..._REFUSED`; bloco de status terminal cobre só CANCELLED/REJECTED/EXPIRED.
- `supabase/functions/criar-pix-recorrente-asaas/index.ts`: `authReqBody` não envia `retryPolicy` nem `minLimitValue`.
- `src/pages/CheckoutV2.tsx`: `pixMode="subscription"` no mensal (~linhas 1019/1032); a tela de QR não reage a autorização recusada.
- Nova rotina de verificação como edge function agendada (cron), lendo `asaas_pix_authorizations` + `asaas_payments`.