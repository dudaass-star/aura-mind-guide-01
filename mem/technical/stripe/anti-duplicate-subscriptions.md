---
name: Anti-duplicação de assinaturas Stripe
description: create-checkout checa subs ativas SEMPRE (não só quando acha customer) e stripe-webhook cancela duplicatas no checkout.session.completed
type: feature
---

Caso raiz (Jenoelma Barboza, 03/04/2026): dois checkouts concluídos no mesmo dia criaram dois customers Stripe com duas subscriptions. Ela cancelou uma; a outra cobrou R$ 29,90/mês até 10/07/2026. Estorno total R$ 126,50 + cancelamento feito em 29/07/2026.

Correções:
- `create-checkout/index.ts`: o bloco anti-dup saiu de dentro do `if (existingCustomer)` e agora roda **sempre**, antes de criar customer. Usa `customers.list({ email })` (consistente) + `customers.search` por variações de telefone — `search` tem indexação eventual e não enxerga customer criado minutos antes.
- `stripe-webhook/index.ts` (`checkout.session.completed`): rede de segurança que varre customers por email/telefone, e se houver mais de uma subscription `active`/`trialing`, mantém a mais recente e cancela as demais (`invoice_now: false, prorate: false`), com auditoria em `failed_message_log` (`error = 'duplicate_stripe_subscription'`).
