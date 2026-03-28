

## Validação R$1 + bloqueio débito/pré-pago — plano revisado

### Ponto 1: Customer já é passado no Checkout Session ✅

O `create-checkout/index.ts` **já passa** `customer: customerId` na linha 143. Isso significa que o Stripe automaticamente anexa o payment method ao customer após pagamento. No webhook, não precisamos de um passo manual de "attach payment method" — basta buscar o payment method mais recente do customer via `stripe.customers.retrieve` com `expand: ['default_source']` ou `stripe.paymentMethods.list`. Confirmado, nenhuma ação extra necessária nesse ponto.

### Ponto 2: Idempotência no webhook ✅

O webhook **já tem** idempotência via `stripe_webhook_events` (linhas 93-112). O `event.id` é inserido e, se der erro de unique constraint (`23505`), o evento é ignorado. Para o novo handler de trial validation (R$1), ele cairá no bloco `checkout.session.completed` existente com a mesma proteção. Confirmado, coberto.

### Ponto 3: UX de débito/pré-pago rejeitado

Este é o ponto que precisa de implementação cuidadosa. O fluxo será:

```text
Checkout R$1 → pagamento OK → webhook recebe checkout.session.completed
  → Verifica card.funding
  → Se débito/pré-pago:
      1. Estorna R$1
      2. NÃO cria subscription
      3. NÃO cria perfil
      4. Envia WhatsApp com explicação + link para tentar de novo
      5. Marca checkout_session como "rejected_card_type"
```

### Implementação — 2 arquivos

**1. `create-checkout/index.ts`** — quando `trial === true`:
- Trocar `mode: "subscription"` por `mode: "payment"`
- Usar um price avulso de R$1 (precisa criar no Stripe via ferramenta)
- Manter `setup_future_usage: 'off_session'` para salvar o cartão e forçar 3DS
- Adicionar metadata: `{ trial_validation: "true", intended_plan: plan, intended_billing: billing }`
- Manter toda a lógica existente para checkout não-trial (subscription normal)

**2. `stripe-webhook/index.ts`** — novo bloco dentro de `checkout.session.completed`:
- Detectar `metadata.trial_validation === "true"`
- Buscar o PaymentIntent expandido para ver `payment_method.card.funding`
- **Se funding === "credit"**:
  1. `stripe.refunds.create({ payment_intent })` — estorna R$1
  2. Buscar payment methods do customer, pegar o mais recente
  3. `stripe.subscriptions.create()` com `trial_period_days: 7`, `default_payment_method`, e metadata do plano
  4. Criar/atualizar perfil com status `trial` (reusar lógica existente)
  5. Enviar mensagem de boas-vindas (reusar lógica existente)
- **Se funding !== "credit"** (débito/pré-pago):
  1. `stripe.refunds.create({ payment_intent })` — estorna R$1
  2. Enviar WhatsApp: "Oi, {nome}! 💜 Infelizmente não aceitamos cartão de débito ou pré-pago. Você pode tentar novamente com um cartão de crédito aqui: {link_checkout}. Se precisar de ajuda, é só me avisar! 💜"
  3. Marcar `checkout_sessions.status = 'rejected_card_type'`
  4. **Não** criar perfil nem subscription
  5. Retornar normalmente

### Pré-requisito: criar Price de R$1

Usar a ferramenta Stripe para criar um produto "Validação de cartão" com price de R$1,00 (100 centavos BRL), one-time. O price ID será hardcoded no `create-checkout`.

### Resumo de segurança

| Preocupação | Status |
|---|---|
| Customer passado no checkout | Já implementado |
| Idempotência (retries do Stripe) | Já implementado via `stripe_webhook_events` |
| UX de rejeição débito/pré-pago | Estorno + WhatsApp + link para retry |
| Race condition webhook | Eliminada (customer auto-attach + idempotência) |

