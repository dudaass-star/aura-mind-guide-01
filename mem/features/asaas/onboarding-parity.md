---
name: Paridade onboarding Asaas vs Stripe
description: webhook-asaas tem paridade 1:1 com stripe-webhook na ativação (profile, portal token, welcome WhatsApp+email, pending_insight), exceto allocateInstance — Meta oficial via sendProactive não usa instância
type: feature
---

`supabase/functions/webhook-asaas/index.ts` chama `handleActivation()` em `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`:

- `resolveProfile(phone, email)` detecta new / returning / upgrade / renewal.
- Renewal (já existe outro payment pago da mesma `asaas_subscription_id`) → só estende `plan_expires_at`.
- Cria/atualiza `profiles` com `status: 'active'` (PIX é pago à vista, não trial), `plan_expires_at = base + CYCLE_DAYS[billing]`.
- Gera `user_portal_tokens` (upsert) e monta `portalLink = https://olaaura.com.br/meu-espaco?t=${token}`.
- Salva `pending_insight: '[WELCOME]...'` no profile.
- Dispara template WhatsApp via `sendProactive` (Meta oficial via Twilio) + retry 3s. Returning recebe `welcomeBackMessage` direto.
- Enfileira email welcome via `send-transactional-email` com `idempotencyKey: welcome-asaas-${paymentId}`.

**Proibido**: `allocateInstance`, `whatsapp_instance_id`, qualquer import de zapi-client além de helpers puros de string (`normalizeBrazilianPhone`, `getPhoneVariations`). Canal único = `sendProactive`.
