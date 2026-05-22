## Objetivo
Webhook Asaas hoje só atualiza `asaas_payments` + estende `plan_expires_at` se profile já existe. Falta tudo de ativação. Vamos replicar 1:1 o fluxo Stripe **menos `allocateInstance`** (Meta WhatsApp oficial — `sendProactive` já roteia sozinho via Twilio/Meta, não usa instância).

## Arquivo único
`supabase/functions/webhook-asaas/index.ts`

## Imports a adicionar
```ts
import { resolveProfile } from "../_shared/profile-resolver.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts"; // só helper de string, sem zapi
import { sendProactive } from "../_shared/whatsapp-provider.ts";
```
(Constantes `PLAN_NAMES` / `PLAN_SESSIONS` — copiar do stripe-webhook. `PLAN_SESSIONS.essencial = 0`.)

## Lógica de ativação (no bloco `if (isPaid && updated?.customer_email)`)

Substituir o bloco atual por:

1. **Resolver profile** via `resolveProfile(supabase, updated.customer_phone, updated.customer_email)`.
2. **Detectar tipo de evento**:
   - `isFirstActivation` = NÃO existe nenhum outro `asaas_payments` com `status IN ('CONFIRMED','RECEIVED')` para esse `asaas_subscription_id` (ou para o mesmo `customer_email` se one-time). Se existir → é renovação → só estender `plan_expires_at` (lógica atual) e parar.
   - `isReturning` = profile existe e `status === 'canceled'`.
   - `isUpgrade` = profile existe e não cancelado, mas `plan` diferente.
   - `isNew` = profile não existe.

3. **Criar / atualizar profile** (sem `whatsapp_instance_id`, sem `allocateInstance`):
   - Novo: `INSERT` com `user_id = crypto.randomUUID()`, `name`, `phone` (formato 55+DDD+9digits via helper), `email`, `plan`, `status: 'active'` (Asaas PIX = pago à vista, não trial), `sessions_used_this_month: 0`, `sessions_reset_date: hoje`, `messages_today: 0`, `last_message_date: hoje`, `needs_schedule_setup: PLAN_SESSIONS[plan] > 0`, `trial_started_at: now()`, `trial_phase: 'listening'`, `current_journey_id: 'j1-ansiedade'`, `current_episode: 0`, `plan_expires_at: now + cycleDays`, `asaas_customer_id`.
   - Existente: `UPDATE` com `plan`, `status: 'active'`, `plan_expires_at` estendido, `updated_at`. Se `isReturning`, resetar `sessions_used_this_month: 0` e `trial_phase: 'listening'`.

4. **Portal token**: `supabase.from('user_portal_tokens').upsert({ user_id }, { onConflict: 'user_id' })` → buscar token → montar `portalLink = https://olaaura.com.br/meu-espaco?t=${token}`.

5. **Welcome message** (3 variantes idênticas ao Stripe, baseadas em `isReturning` / `isUpgrade` / `isNew`) salva como `pending_insight: '[WELCOME]' + welcomeMessage` no profile. Entrega quando usuário clicar "Começar".

6. **Template WhatsApp curto** via `sendProactive(formattedPhone, 'Olá, ${name}. Sua assinatura da Aura foi ativada com sucesso.', 'welcome', profileUserId)` com retry de 3s. Sem zapi, sem instância — `sendProactive` decide canal sozinho (Meta/Twilio oficial).

7. **Welcome email** via `supabase.functions.invoke('send-transactional-email', { body: { templateName: 'welcome', recipientEmail, idempotencyKey: 'welcome-asaas-${payment.id}', templateData: { name, portalUrl: portalLink } } })`.

8. **Welcome back** (returning only): `sendProactive` com `welcomeBackMessage` (copiar string exata do stripe-webhook linha ~944) — adicional ao template do passo 6, ou substituindo conforme padrão Stripe.

9. **CAPI Purchase/Subscribe** (não-bloqueante): replicar chamada para `meta-capi` se `customer_phone` ou `customer_email` disponível, com `event_name: 'Subscribe'`, `event_id: asaas_payment_id`. Pular se Asaas não tiver `fbp/fbc` (na real, checkout V2 Asaas hoje não persiste fbp/fbc — passo opcional).

## O que NÃO fazer (regra dura)
- ❌ Não importar `instance-helper.ts`, não chamar `allocateInstance()`, não setar `whatsapp_instance_id`.
- ❌ Não importar nada de `zapi-client.ts` exceto helpers puros de string (`normalizeBrazilianPhone`, `getPhoneVariations`) — esses helpers não disparam chamadas Zapi.
- ❌ Não tocar em `stripe-webhook`, `criar-pix-asaas`, `criar-pix-recorrente-asaas`.
- ❌ Não enviar mensagem WhatsApp via nada que não seja `sendProactive`.

## Checklist de paridade (verificação final antes de fechar)

| Item Stripe | Replicado no Asaas? |
|---|---|
| `resolveProfile` por phone+email | ✅ passo 1 |
| Detecção returning / upgrade / new | ✅ passo 2 |
| Criar profile (sem instância) | ✅ passo 3 |
| Atualizar profile existente | ✅ passo 3 |
| Estender `plan_expires_at` em renovação | ✅ lógica atual mantida |
| Portal token + link | ✅ passo 4 |
| `pending_insight: [WELCOME]...` | ✅ passo 5 |
| Template WhatsApp via `sendProactive` + retry | ✅ passo 6 |
| Email welcome via `send-transactional-email` | ✅ passo 7 |
| Welcome back returning | ✅ passo 8 |
| CAPI | ⚠️ opcional (passo 9) |
| Alocação instância | ❌ propositalmente removido |

## Deploy + validação
1. `deploy_edge_functions(["webhook-asaas"])`.
2. Disparar `curl_edge_functions` com payload mockado `PAYMENT_RECEIVED` para customer novo → verificar nos logs: profile criado, portal token gerado, welcome template enviado, email enfileirado, `pending_insight` salvo.
3. Disparar segundo `PAYMENT_RECEIVED` da mesma subscription → verificar que **NÃO** dispara welcome de novo (só estende `plan_expires_at`).
4. Query `profiles` por `email` do customer de teste → confirmar `status='active'`, `plan_expires_at` correto, `pending_insight` com `[WELCOME]`.

## Memória
Atualizar `mem://features/stripe/onboarding-reliability` registrando que **webhook-asaas tem paridade 1:1 com stripe-webhook para ativação, exceto `allocateInstance` (Meta oficial via `sendProactive` não usa instância — zapi proibido)**.
