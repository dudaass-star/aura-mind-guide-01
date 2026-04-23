

# Implementar Opção C — Reforço CIT→MIT no Plano Semanal

## O que será feito

### 1. Reverter `create-checkout` para `mode: 'payment'` + reforçar mandato
Em `supabase/functions/create-checkout/index.ts`, refatorar o bloco `if (trial)`:

- Voltar a `mode: 'payment'` (cobra R$ 6,90/9,90/19,90 imediatamente, como antes)
- Restaurar uso do `priceId` do plano semanal (env vars `STRIPE_PRICE_*_TRIAL`)
- **Adicionar `payment_intent_data: { setup_future_usage: 'off_session', metadata: {...} }`** — flag-chave que estabelece o mandato MIT desde a 1ª autorização
- Manter `payment_method_collection: 'always'`, `payment_method_types: ['card']` e `request_three_d_secure: 'automatic'` (sem mexer em 3DS)
- Restaurar metadata `trial_validation: "true"` (preserva compatibilidade com `recover-abandoned-checkout`, `audit-recovered-payments`, `attach-checkout-payment-methods`)
- Adicionar `metadata.cit_mit_reinforced: "true"` para marcar nos logs/auditoria que esses checkouts já vêm com mandato off_session

### 2. Ajustar `stripe-webhook` para reforçar Subscription com PaymentMethod do trial
Em `supabase/functions/stripe-webhook/index.ts`:

- **Remover** o bloco `if (session.metadata?.trial_unified === 'true')` (adicionado na rodada anterior, não funciona como esperado)
- **Reforçar** o handler legado `trial_validation` ao criar a Subscription:
  - Buscar `payment_intent` da session expandido (`stripe.paymentIntents.retrieve(pi_id, { expand: ['payment_method'] })`)
  - Pegar o `payment_method` resultante
  - Passar `default_payment_method: <pm_id>` no `stripe.subscriptions.create()`
  - Passar `off_session: true`
  - Manter `payment_behavior: 'allow_incomplete'`, `trial_period_days: 7`
  - Logar `latest_charge.payment_method_details.card.network_transaction_id` para conferir vínculo

### 3. Sem mudanças em outras funções
- `audit-decline-codes` (criada na rodada anterior) — continua funcionando
- `recover-abandoned-checkout`, `audit-recovered-payments` — voltam a detectar checkouts (porque `trial_validation` foi restaurado)
- `attach-checkout-payment-methods` — continua útil como fallback
- Sem migration de DB

## Por que isso resolve

```
Antes (sem setup_future_usage):
  PI R$ 6,90 → PM salvo "on_session" apenas
  Subscription criada → 7d → cobra R$ 29,90 sem referência ao PI original
  Banco: "tentativa órfã" → do_not_honor

Depois (com setup_future_usage='off_session' + default_payment_method):
  PI R$ 6,90 confirmado COM mandato off_session + network_transaction_id
  Subscription criada herdando o MESMO PM
  7d → cobra R$ 29,90 referenciando o mandato original
  Banco: "continuidade autorizada do mesmo merchant" → aprova
```

## Arquivos afetados

```text
supabase/functions/create-checkout/index.ts   [REVERTER bloco trial + adicionar setup_future_usage + cit_mit_reinforced]
supabase/functions/stripe-webhook/index.ts    [REMOVER bloco trial_unified + reforçar trial_validation com default_payment_method]
```

## Sobre os build errors no diff anterior

Os erros de TypeScript listados (`audit-orphan-subscribers`, `aura-agent`, `check-instance-health`, `admin-engagement-metrics`, `admin-preview-emails`) são **pré-existentes** e não relacionados a esta mudança — foram introduzidos por edições anteriores em outras funções. Vou ignorar nesta rodada (escopo: só CIT→MIT). Se quiser, abrimos uma rodada separada de "limpeza de TS errors" depois.

## Validação pós-deploy

1. **Smoke test imediato**: 1 checkout real do Plano Semanal. No Dashboard Stripe, conferir:
   - PaymentIntent **succeeded** R$ 6,90 com `setup_future_usage: off_session` ✅
   - Customer com PaymentMethod salvo e reusável off_session ✅
   - Subscription `trialing` com `default_payment_method` = MESMO PM da 1ª cobrança ✅
2. **Forçar renovação no Dashboard** (avançar trial via "Advance test clock" ou aguardar): invoice R$ 29,90 deve processar como MIT recorrente sem pedir cartão de novo
3. **Em 14 dias**: rodar `audit-decline-codes` e comparar % `do_not_honor` vs baseline
4. **Métrica-chave**: aprovação da 1ª cobrança pós-Plano Semanal — meta sair de ~60% para 70–75% (sem 3DS)

## Risco & rollback

- Risco **baixo**: mudança cirúrgica em 2 funções, mantém 100% da arquitetura conhecida (`trial_validation` é o fluxo testado por meses).
- Rollback: reverter as 2 funções; código volta a funcionar como hoje.

