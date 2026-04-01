

# Auditoria: Cancelamento, Dunning e Stripe — Verificação Final

## Status: Tudo funcional, 1 problema cosmético no Stripe

## Verificação Completa

### 1. `create-checkout/index.ts` — OK
- `trialPriceId` corretamente scopado (linha 159: `let trialPriceId`)
- Trial usa `mode: "payment"` com `setup_future_usage: 'off_session'`
- Metadata inclui `trial_validation: "true"` para o webhook identificar

### 2. `stripe-webhook/index.ts` — OK
- `trial_period_days: 7` (linha 208)
- Description: "7 dias de acesso incluídos — a primeira cobrança será no 8º dia." (linha 219)
- `payment_behavior: 'allow_incomplete'` para dunning funcionar
- PM sincronizado em subscription + customer invoice_settings
- `invoice.paid` converte trial → active corretamente
- `invoice.payment_failed` cria audit trail + envia WhatsApp dunning
- `customer.subscription.deleted` marca profile como canceled + envia despedida
- `customer.subscription.updated` (trialing→active) converte trial
- `customer.subscription.resumed` reativa profile

### 3. `cancel-subscription/index.ts` — OK
- Fluxo check/pause/cancel funcional
- Pause com `resumes_at` de 30 dias
- Cancel com `cancel_at_period_end: true`
- Salva feedback em `cancellation_feedback`
- Atualiza profile status (canceling/paused)

### 4. Dunning (`reprocess-dunning/index.ts`) — OK
- Usa `resolveProfile` para encontrar perfil
- Gera Billing Portal link + shortens URL
- Envia WhatsApp dunning empático
- Registra em `dunning_attempts`

### 5. `fix-subscription-payment-methods/index.ts` — OK
- Corrige PMs faltando em subscriptions trialing/active/past_due

### 6. `reconcile-subscriptions/index.ts` — OK
- Reconcilia subscriptions ativas com profiles no banco

## Problema Encontrado

### Subscriptions antigas no Stripe com description "5 dias"
As **5 subscriptions atualmente em trialing** no Stripe foram criadas com o código antigo e têm a description `"5 dias grátis — a primeira cobrança será apenas no 6º dia."`. Isso é **cosmético** — o trial real dessas subs é de 5 dias (criadas antes da atualização). Novas subscriptions já usarão "7 dias".

**Ação opcional:** Atualizar a description dessas 5 subscriptions existentes no Stripe para refletir a realidade (não afeta funcionalidade, mas evita confusão visual no dashboard).

### `schedule-setup-reminder` — "5 dias" é intencional
A menção de "5 dias" na linha 195 refere-se a inatividade de agendamento de sessões, não ao trial. Correto como está.

## Conclusão

A implementação de cancelamento, dunning e integração com Stripe está **100% alinhada** com o novo trial pago de 7 dias. Não há bugs ou inconsistências de lógica.

## Ação Sugerida (opcional, cosmético)

Atualizar a `description` das 5 subscriptions trialing existentes no Stripe de "5 dias grátis" para "7 dias de acesso incluídos" usando a API de update. Isso pode ser feito com uma chamada simples para cada subscription.

