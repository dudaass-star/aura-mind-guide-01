## Trial reduzido de 7 para 5 dias — IMPLEMENTADO ✅

## Validação R$1 + bloqueio débito/pré-pago — IMPLEMENTADO ✅

### O que foi feito

1. **Produto Stripe criado**: "Validação de cartão AURA" — R$1,00 one-time (price_1TG3zEQU15XnZ7Vv75qpmBf8)

2. **create-checkout/index.ts** — quando `trial === true`:
   - Usa `mode: "payment"` com price de R$1
   - `setup_future_usage: 'off_session'` para forçar 3DS e salvar cartão
   - Metadata inclui `trial_validation: "true"`, `plan`, `billing`
   - Checkout não-trial permanece inalterado

3. **stripe-webhook/index.ts** — novo bloco `trial_validation`:
   - Detecta `metadata.trial_validation === "true"` + `mode === "payment"`
   - Sempre estorna o R$1 via `stripe.refunds.create()`
   - Verifica `card.funding` do PaymentMethod
   - **Se credit**: cria subscription com `trial_period_days: 7` + `default_payment_method`, cria perfil, envia boas-vindas, CAPI StartTrial
   - **Se debit/prepaid**: marca `rejected_card_type`, envia WhatsApp com link curto para tentar de novo com crédito, NÃO cria perfil/subscription
   - Idempotência via `stripe_webhook_events` (já existia)
   - Customer passado no checkout (já existia)

### Fluxo

```text
Usuário escolhe trial → Checkout R$1 (3DS) → Webhook:
  ├── Cartão crédito → estorna R$1 → cria subscription trial 7d → perfil + boas-vindas
  └── Débito/pré-pago → estorna R$1 → WhatsApp com link retry → rejeita
```
