---
name: Dunning WhatsApp (cartão + PIX)
description: Recuperação de pagamento via WhatsApp com template Twilio aprovado, casada com Smart Retries Stripe e retries Asaas/PIX Automático Bacen
type: feature
---

Disparo automático de WhatsApp para usuários com falha de pagamento, em paralelo ao email de dunning. Usa a SUBACCOUNT Twilio dedicada de recuperação (mesma do carrinho abandonado, fora do número da Aura).

- Helper: `supabase/functions/_shared/dunning-whatsapp.ts` (`sendDunningWhatsApp`).
- Template aprovado: `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` — `{{1}}` primeiro nome, `{{2}}` URL completa `https://olaaura.com.br/pagamento?t=<token>`.
- Secrets reutilizados: `TWILIO_RECOVERY_ACCOUNT_SID/AUTH_TOKEN/FROM`.
- Limite: **2 envios por subscription/payment** (`DUNNING_MAX_ATTEMPTS`). Conta apenas `message_sid not null` em `dunning_attempts`.
- Idempotência por `(profile_user_id, event_id, channel='whatsapp')`.
- NÃO respeita quiet hours (utility transacional).

Gatilhos:
- **Stripe `invoice.payment_failed`** (`stripe-webhook/index.ts`): roda após o email de dunning, casado com Smart Retries (4 tentativas, 3 semanas) — Stripe re-emite o evento a cada retry, e o limite de 2 envios WhatsApp se aplica naturalmente.
- **Asaas `PAYMENT_OVERDUE`** (`webhook-asaas/index.ts`): cobre PIX recorrente (`/subscriptions`) E PIX Automático Bacen (`pixAutomaticAuthorizationId` reusado como `subscription_id`). `eventId = asaas-PAYMENT_OVERDUE-<paymentId>` garante dedup.

Link de retomada `/pagamento?t=<token>` resolve em `customer-portal/index.ts`:
1. Stripe customer → Billing Portal session.
2. Senão, último `asaas_payments` do user em `OVERDUE`/`PENDING` → `invoice_url` (fatura Asaas com PIX Copia-e-Cola).
3. Senão, mensagem "fale com o suporte".

Auditoria em `public.dunning_attempts` (colunas adicionadas: `channel`, `provider`, `template_sid`, `message_sid`, `attempt_number`, `payment_id`). Índices `(profile_user_id, channel)` e `(event_id)`.