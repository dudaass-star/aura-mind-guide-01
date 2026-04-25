# Implementar mandate_options + statement_descriptor_suffix

Dois reforços cirúrgicos pro banco reconhecer a renovação como continuidade autorizada do mandato inicial. Sem fricção, sem 3DS na renovação.

## Mudanças

### 1. `supabase/functions/create-checkout/index.ts` (bloco trial, ~linha 290)

Adicionar `mandate_options` ao `payment_method_options.card` da 1ª cobrança:

```ts
sessionConfig.payment_method_options = {
  card: {
    request_three_d_secure: 'automatic',
    mandate_options: {
      reference: `aura-${customerId}-${Date.now()}`, // ID único do mandato
      amount_type: 'maximum',
      amount: 60000, // R$ 600 — teto que cobre maior plano anual (Transformação 574,90)
      currency: 'brl',
      interval: 'sporadic', // Stripe escolhe quando cobrar (semanal→mensal→anual)
      supported_types: ['india'], // ignorado fora da Índia, mas exigido pelo schema
      description: 'Assinatura AURA — cobrança recorrente conforme plano escolhido.',
    },
  },
};
```

E adicionar `statement_descriptor_suffix` ao `payment_intent_data`:

```ts
sessionConfig.payment_intent_data = {
  setup_future_usage: 'off_session',
  statement_descriptor_suffix: 'AURA SEMANAL', // aparece na fatura como "AURA* AURA SEMANAL"
  description: `AURA ${planDisplayName} — Plano Semanal (7 dias), depois R$ ${displayPrice}/${periodLabel}.`,
  metadata: { /* ... mantém igual ... */ },
};
```

### 2. `supabase/functions/stripe-webhook/index.ts` (criação da Subscription, ~linha 300)

Adicionar `payment_settings` herdado + `description` consistente:

```ts
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: subscriptionPriceId }],
  trial_period_days: 7,
  payment_behavior: 'allow_incomplete',
  off_session: true,
  ...(defaultPm && { default_payment_method: defaultPm }),
  payment_settings: {
    payment_method_types: ['card'],
    save_default_payment_method: 'on_subscription',
  },
  metadata: { /* ... mantém igual + ... */ },
  description: `AURA ${PLAN_NAMES[customerPlan]} — Assinatura ${customerBilling === 'yearly' ? 'anual' : 'mensal'}`,
});
```

E adicionar `statement_descriptor` na invoice da renovação via update no Customer:

```ts
// Após criar a Subscription, sincronizar invoice settings com descriptor consistente
await stripe.customers.update(customerId, {
  invoice_settings: {
    default_payment_method: defaultPm,
    custom_fields: null,
  },
  metadata: {
    ...(customer as any).metadata,
    aura_mandate_active: 'true',
    aura_mandate_reference: `aura-${customerId}`,
  },
});
```

> Nota técnica: o `statement_descriptor` da Subscription é controlado pelo Statement Descriptor da conta Stripe (configurado no Dashboard como "AURA"). O `_suffix` na 1ª cobrança garante que a fatura mostra "AURA* AURA SEMANAL" e as renovações mostram "AURA* AURA" — padrão estável de mesmo merchant pro banco.

## Por que esses 2 sinais funcionam

1. **`mandate_options.reference`** — vai junto na autorização inicial. Bandeiras (Visa/Mastercard) propagam isso pro emissor como "este merchant tem permissão pré-acordada de cobrar até R$ X de forma esporádica neste cartão".

2. **`statement_descriptor` consistente** — algoritmos antifraude dos bancos BR (Itaú, Bradesco, Nubank) usam padrão de descriptor como sinal forte de legitimidade. "AURA*" estável = baixo risco; descriptor mudando = alto risco de chargeback → bloqueio preventivo.

## Validação pós-deploy

Vou rodar `audit-decline-codes` (últimos 7d) pra capturar baseline antes de aplicar. 30 dias depois, rodar de novo e medir variação em `do_not_honor`.

## Atualizações de memória

- Atualizar `mem://technical/stripe/checkout-3ds-policy` pra refletir `'automatic'` (alinha código + memória)
- Criar `mem://technical/stripe/mit-mandate-reinforcement` documentando os 2 reforços e o teto de R$ 600

## Sem migrações de banco. Sem mudanças no frontend. Sem fricção pro usuário.