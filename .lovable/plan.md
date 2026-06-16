## Reenviar Purchase ao Meta CAPI das compras de ontem/hoje + verificar recepção

### Passos

1. **Criar edge function `backfill-meta-purchase`** (one-shot reaproveitável, protegida por header secret):
   - Lista compras de janela configurável (default 48h):
     - **Stripe**: lê `stripe_webhook_events` últimos N h + cruza com Stripe API (`stripe.checkout.sessions.retrieve`) pra ter `metadata.fbp/fbc/ga_client_id`, `customer_email`, `amount_total`, `id`.
     - **Asaas**: `SELECT * FROM asaas_payments WHERE status IN ('CONFIRMED','RECEIVED') AND paid_at >= now() - interval 'X hours'`.
   - Para cada uma, valida 1ª compra:
     - Stripe: sem profile prévio na resolução por email/phone OU profile criado pelo próprio webhook (igual lógica atual).
     - Asaas: nenhum outro `asaas_payment` `CONFIRMED/RECEIVED` mais antigo da mesma `asaas_subscription_id`.
   - Pula renovação/upgrade/returning (mantém a regra).
   - Dispara `meta-capi` com:
     - `event_id` = `session.id` (Stripe) ou `asaas_payment_id` (Asaas) → **Meta deduplica** se já recebeu.
     - `event_name = "Purchase"`, `source = "backfill-manual"`, `is_first_purchase = true`.
     - `user_data`: email + phone + first_name + (fbp/fbc quando disponíveis).
     - `custom_data`: value (BRL), content_name, content_category.
   - 500ms entre chamadas. Retorna JSON com contadores `{total, sent, skipped_renewal, skipped_no_email, errors}`.

2. **Disparar** via `curl_edge_functions POST /backfill-meta-purchase` com `{"hours": 48}`.

3. **Verificar recepção** via `psql`:
   ```sql
   SELECT created_at, event_name, event_id, meta_status, meta_fbtrace_id,
          meta_error, email_present, phone_present, fbp_present, request_value
   FROM meta_capi_log
   WHERE source = 'backfill-manual'
   ORDER BY created_at DESC;
   ```
   Reporto a tabela inteira ao usuário, com diagnóstico por linha:
   - `meta_status = 200` + `fbtrace_id` → ✅ Meta aceitou.
   - `meta_status != 200` → mostro o `meta_error` literal.

### O que esperar no Meta Events Manager

- Eventos chegam no **Events Manager** em até ~20 min em produção (não estou usando `test_event_code`).
- Atribuição de anúncio (qual campanha) só vem forte se `fbp`/`fbc` estiverem presentes. Stripe das últimas 48h: provavelmente tem (`metadata.fbp/fbc` setado no `create-checkout`). Asaas PIX antigo: vazio (coluna criada hoje) — Purchase chega mesmo assim via hash de email+phone, mas atribuição fica fraca/genérica.
- Se Meta já tiver recebido o evento (mesmo `event_id`), aceita silenciosamente e deduplica — sem efeito colateral.

### Arquivos tocados

- `supabase/functions/backfill-meta-purchase/index.ts` (novo, one-shot).
- Sem migration (`meta_capi_log` já existe).
- Sem alteração em código de produção.

### Não vou fazer

- Não vou refazer Purchase de renovações/upgrades (regra: só 1ª compra).
- Não vou usar `test_event_code` (evento precisa entrar como produção, não como teste).
- Não vou criar UI admin — basta o curl + a query SQL.
