---
name: Subscribe (cobrança cheia) x Purchase (entrada 6,90)
description: Purchase = aquisição a R$ 6,90 e alvo de otimização (CAC); Subscribe = 1ª cobrança cheia do ciclo, só medição de receita/ROAS
type: feature
---
**Purchase** continua sendo o evento de aquisição (entrada de R$ 6,90) e o **alvo de otimização das campanhas** — evento frequente e barato = CAC menor. Nunca trocar o alvo para a cobrança cheia (atrasaria o sinal em 8 dias e reduziria volume).

**Subscribe** foi criado só para **medição de receita/ROAS**, com o valor real do ciclo (29,90 / 59,70 / 118,80...). Resolve o aviso do Meta "Enviar mais preços", que aparece porque todo Purchase sai em 6,90.

Onde dispara (helper `_shared/meta-subscribe.ts`, dedupe por `event_id` em `meta_capi_log`, envia Meta CAPI + ChatGPT Ads + GA4 `subscribe`):
- `stripe-webhook` → `invoice.paid` com `billing_reason != subscription_create`
- `webhook-woovi` → débito do mandato (não `trialEntry`; pula 1º ciclo de mandato sem trial, que já é Purchase cheio)
- `webhook-inter` → ciclos com `isFirstPayment=false` (ciclo 0 é a entrada)
- `webhook-asaas` → `isRenewal=true`, antes do `return`

Funil admin: step `subscription_confirmed` → linha "Cobrança cheia do ciclo (8º dia)" em `CheckoutFunnelPanel`.