---
name: Dunning WhatsApp (cartão + PIX)
description: Recuperação de pagamento via WhatsApp com template Twilio aprovado, casada com Smart Retries Stripe e retries Asaas/PIX Automático Bacen
type: feature
---

Disparo automático de WhatsApp para usuários com falha de pagamento, em paralelo ao email de dunning. Usa a SUBACCOUNT Twilio dedicada de recuperação (mesma do carrinho abandonado, fora do número da Aura).

- Helper: `supabase/functions/_shared/dunning-whatsapp.ts` (`sendDunningWhatsApp`).
- Template genérico (fallback/utility): `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` — `{{1}}` primeiro nome, `{{2}}` URL completa `https://olaaura.com.br/pagamento?t=<token>`.
- **Escada de ofertas por tentativa** (`DUNNING_OFFER_LADDER`), categoria Marketing, `{{1}}` nome + `{{2}}` query string do botão (`t=<token>&offer=<tier>`, URL `https://olaaura.com.br/cancelar?{{2}}`):
  1. `dunning_offer_30` → `HX50cb75b6bb3cd9ae56ef2d9c6adc4781`
  2. `dunning_offer_lite` → `HX18e81fa401b8487c360f085e9b83630f`
  3. `dunning_offer_base` → `HX65a53c5b0bb1dd7868146ee118c125fb`
- Templates de oferta são Marketing → só disparam entre **08h e 21h BRT**; fora da janela o envio é adiado via `scheduled_tasks` (`task_type = 'dunning_offer_whatsapp'`, executado por `execute-scheduled-tasks`).
- `/cancelar` lê `?offer=<tier>` e coloca/destaca o card correspondente no topo da escada de retenção.
- Secrets reutilizados: `TWILIO_RECOVERY_ACCOUNT_SID/AUTH_TOKEN/FROM`.
- Limite: **3 envios por subscription/payment** (`DUNNING_MAX_ATTEMPTS`, um por degrau). Conta apenas `message_sid not null` **e `template_sid` dentro de `DUNNING_OFFER_LADDER`** — envios antigos do template genérico não queimam a cota da escada.
- Idempotência por `(profile_user_id, event_id, channel='whatsapp')`.
- NÃO respeita quiet hours (utility transacional).

Gatilhos:
- **Stripe `invoice.payment_failed`** (`stripe-webhook/index.ts`): roda após o email de dunning, casado com Smart Retries (4 tentativas, 3 semanas) — Stripe re-emite o evento a cada retry, e o limite de 2 envios WhatsApp se aplica naturalmente.
- **Asaas `PAYMENT_OVERDUE`** (`webhook-asaas/index.ts`): cobre PIX recorrente (`/subscriptions`) E PIX Automático Bacen (`pixAutomaticAuthorizationId` reusado como `subscription_id`). `eventId = asaas-PAYMENT_OVERDUE-<paymentId>` garante dedup.
- **Retry de cartão Asaas falho** (`execute-scheduled-tasks`, case `card_retry_asaas`): cada recharge que não confirma dispara o próximo degrau (`eventId = asaas-cardretry-<paymentId>-<attempt>`). Sem isso o cartão Asaas ficava travado no degrau 1, porque os retries D+2/D+4/D+7 são internos e não reemitem `PAYMENT_OVERDUE`. Ritmo efetivo: D0 (30% off) → D+2 (Lite) → D+4 (Base) → D+7 bate o teto de 3 envios.

Link de retomada `/pagamento?t=<token>` resolve em `customer-portal/index.ts`:
1. Stripe customer → Billing Portal session.
2. Senão, último `asaas_payments` do user em `OVERDUE`/`PENDING` → `invoice_url` (fatura Asaas com PIX Copia-e-Cola).
3. Senão, mensagem "fale com o suporte".

Auditoria em `public.dunning_attempts` (colunas adicionadas: `channel`, `provider`, `template_sid`, `message_sid`, `attempt_number`, `payment_id`). Índices `(profile_user_id, channel)` e `(event_id)`.

Aterrissagem da oferta:
- `/cancelar?t=<token>&offer=<tier>` — o front resolve o `t` chamando `cancel-subscription` com `{ token, action: "check" }` (a edge aceita `token` como identidade alternativa ao telefone, via `user_portal_tokens`) e pula direto para o passo `offer_ladder` com o tier destacado. Sem telefone, sem escolher motivo.
- Downgrade Stripe (`downgrade_to_lite/base`): faz `voidInvoice` nas invoices `open` do ciclo antigo, troca o price com `billing_cycle_anchor: "now"` (cobra o novo valor na hora) e só marca `profiles.status = 'active'` se a subscription voltar a `active`/`trialing`; senão devolve `status: "payment_required"`.
- Price IDs de retenção no Stripe: Lite `price_1TwR9yQU15XnZ7Vv59okBz23` (R$19,90), Base `price_1TwRA2QU15XnZ7Vvt0zU4HNa` (R$9,90). Mapeados no `stripe-webhook` como `essencial/monthly` (entitlements inalterados; o tier vive em `profiles.plan_tier`).