---
name: Meta Purchase só 1ª compra
description: Regra estrita — Purchase para o Meta CAPI dispara apenas na 1ª compra do cliente (aquisição via anúncio). Renovações, upgrades e returning customers NUNCA disparam Purchase.
type: constraint
---
**Regra:** o evento `Purchase` no Meta CAPI mede aquisição de cliente novo vindo do anúncio. Só dispara quando:
- Stripe `checkout.session.completed`: `!isReturning && !isUpgrade` (cliente sem profile prévio).
- Asaas PIX `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`: `isNew === true` em `handleActivation` (sem profile prévio e não é renovação da subscription).

**Nunca dispara em:**
- Stripe `invoice.paid` (renovação recorrente).
- Stripe `customer.subscription.updated/resumed`.
- Asaas renovação automática (`isRenewal=true`).
- Upgrade de plano ou returning (cancelado→reativado).

**Auditoria:** tabela `meta_capi_log` registra todo disparo com `is_first_purchase`, `source`, `meta_status`, `meta_fbtrace_id`, `meta_error`. Consulta SQL para diagnosticar atribuição.

**Por quê:** o objetivo do tracking é otimizar campanhas de aquisição no Meta. Recorrência polui o sinal e infla CAC.