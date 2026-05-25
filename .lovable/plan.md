## Contexto

Hoje a função `recover-abandoned-checkout-whatsapp` roda a cada 5min e varre apenas `checkout_sessions` (Stripe/cartão). O PIX via Asaas — ativado ontem e já com leads reais pendentes (Raiana, Ana Paula nas últimas 24h) — grava em `asaas_payments` e fica **fora** desse fluxo. Resultado: ninguém que abandona o PIX recebe WhatsApp.

## O que muda

Mesma cadência, mesmo número (subaccount Twilio), mesmos 2 templates aprovados (15min e 24h) — só amplio a fonte de dados pra incluir `asaas_payments` com `status='PENDING'`.

## Mudanças

### 1. Migration: colunas de controle em `asaas_payments`
- `whatsapp_recovery_15min_sent_at timestamptz`
- `whatsapp_recovery_24h_sent_at timestamptz`
- `whatsapp_recovery_last_error text`

(Mesmo padrão de `checkout_sessions`, pra marcar "já mandei" e evitar reenvio.)

### 2. Edge function `recover-abandoned-checkout-whatsapp` (estender)
Adicionar um segundo loop em paralelo aos `STAGES` existentes que processa `asaas_payments`:

- Query: `status='PENDING'`, `customer_phone IS NOT NULL`, `created_at >= WHATSAPP_RECOVERY_CUTOFF`, `created_at < now() - minAgeMinutes`, coluna do estágio ainda nula.
- Aplica os **mesmos** filtros de skip (cliente ativo por email/telefone, checkout Stripe já pago, telefone já com PIX `RECEIVED`).
- **Dedupe cross-source**: monta um set global de telefones que já receberam template naquele estágio (vindos de `checkout_sessions` + `asaas_payments`) pra não disparar 2x pro mesmo número quando o lead tentou cartão e PIX.
- Dispara o mesmo `sendRecoveryTemplate` (`{{1}} = primeiro nome`).
- Loga em `checkout_recovery_attempts` (campo novo `asaas_payment_id` opcional, ou só registra no `error_message` o contexto — pra evitar nova coluna, uso o campo `provider_response` com `{ asaas_payment_id }`).
- Loga outbound em `recovery_messages` / `recovery_conversations` com `metadata.asaas_payment_id` (sem `checkout_session_id`).

### 3. Sem mudança em UI
O painel `/admin/whatsapp-inbox` já lê `recovery_conversations` por telefone — vai aparecer automaticamente, com ou sem `checkout_session_id`. Pequeno tweak no card de contexto pra mostrar "Tentou PIX – plano X" quando `checkout_session_id` é null mas há `metadata.asaas_payment_id` (busca em `asaas_payments`).

## Fora do escopo
- E-mail de recuperação PIX (fluxo de e-mail continua só Stripe).
- Cobrir leads anteriores ao `WHATSAPP_RECOVERY_CUTOFF` (2026-05-24) — backlog fica como está.
- PIX expirado: continuamos mandando o template de 24h mesmo se o QR original expirou, porque o template já redireciona para `/v2/checkout` onde o lead gera um novo.

## Detalhes técnicos
- Reusa `sendRecoveryTemplate`, `normalizeBrazilianPhone`, `getPhoneVariations`.
- Reusa `TEMPLATE_15MIN` e `TEMPLATE_24H` (`{{1}} = nome`).
- Quiet hours 22h-08h BRT mantidas.
- Dedup por telefone normalizado dentro do mesmo estágio.
- Skip também por `phone` já presente em `asaas_payments` com `status IN ('RECEIVED','CONFIRMED')` (cliente já pagou via PIX em outra cobrança).

## Após deploy
Próximo cron (≤5min) pega os 2 PENDING das últimas horas (Raiana, Ana Paula) e dispara o template 15min — você vê chegando no inbox `/admin/whatsapp-inbox`.
