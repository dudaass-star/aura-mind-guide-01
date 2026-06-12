## Problema

No funil do Admin Engagement, o mesmo cliente que abre cartão (Stripe → `checkout_sessions`) e depois paga via PIX (Asaas → `asaas_payments`) é contado **duas vezes**: 1 em "criados" Stripe + 1 em "criados" Asaas, e o Stripe permanece como `created` (abandonado) mesmo após o PIX ser pago.

Caso real de hoje (Jana — `janainakurth4022@gmail.com`):
- 14:57 abriu cartão Stripe → `checkout_sessions.status='created'` (conta como "Desistiu")
- 14:58 abriu PIX Asaas → pago às 15:00 (conta como "Finalizou")
- Resultado exibido: 2 criados / 1 abandonado / 1 finalizado (errado). Correto: 1 criado / 0 abandonado / 1 finalizado.

A raiz é o agregador em `supabase/functions/admin-engagement-metrics/index.ts`, que **soma** Stripe + Asaas sem cruzar identidades (linhas 1524–1529).

## O que vai mudar

Editar apenas `supabase/functions/admin-engagement-metrics/index.ts`. Sem mudanças de schema, UI ou outras edge functions.

### 1. Construir índice de pagantes confirmados (período + all-time)

Antes de calcular os totais combinados, montar dois conjuntos auxiliares:

- `paidEmailsInPeriod` / `paidPhonesInPeriod` — todo email/telefone que tenha:
  - `checkout_sessions.status='completed'` no período, **ou**
  - `asaas_payments.status ∈ PAID_STATUSES` com `paid_at` no período.
- `paidEmailsAllTime` / `paidPhonesAllTime` — equivalente sem filtro de período.

Telefones são normalizados via `normalizeBrazilianPhone` (já usado no projeto) para casar variações `55…` / `…9…`.

### 2. Filtrar "criados" Stripe antes de contar

Ao montar `uniquePhonesCreated` (linhas 826–833 e 840–847), descartar a sessão Stripe `created` quando o **mesmo email OU telefone normalizado** já aparece em `paidEmailsInPeriod`/`paidPhonesInPeriod` (ou versão all-time). Para isso, o `SELECT` em `checkout_sessions` passa a incluir `email` além de `phone`/`status`.

### 3. Filtrar "criados" Asaas com confirmação Stripe

Simetricamente, ao montar `pixCreatedEmails` (linha 1297) e `pixEmailsCreated` (linha 1326), remover entradas cujo email/telefone tenha `completed` em `checkout_sessions` no mesmo recorte. Isso evita o caso inverso (abriu PIX, pagou no cartão).

### 4. Totais combinados sem dupla contagem

Substituir a soma ingênua (linhas 1524–1529) por uniões de conjuntos:

- `checkoutCreatedTotalInPeriod = |criadosStripeDedup ∪ criadosAsaasDedup|` (chave: email normalizado ou telefone normalizado).
- `checkoutCompletedTotalInPeriod = |pagosStripe ∪ pagosAsaas|` (mesma chave).
- Mesma lógica para `…AllTime`.

`checkoutDropoffInPeriod` continua sendo `criados − completados`, agora já consistente.

### 5. Logs

Adicionar um `console.log` mostrando quantos Stripe `created` foram suprimidos por terem pago em Asaas e vice-versa, para conferência futura.

## Validação

Após o deploy, rodar `admin-engagement-metrics` para hoje (BRT) e confirmar que o funil retorna `1 criado / 1 finalizado / 0 abandonado / 100%` no caso da Jana. Conferir também um dia anterior para garantir que números históricos não regredem.

## Fora de escopo

- Atualizar `checkout_sessions.status` para `completed` quando o pagamento sai por outro canal: é uma limpeza desejável, mas envolve mexer no `stripe-webhook` e/ou no webhook do Asaas. Pode virar um segundo ciclo se você quiser.
- Mudanças na função `recover-abandoned-checkout` (ela já filtra clientes ativos por email/telefone, então não dispara recovery indevida nesse caso).
