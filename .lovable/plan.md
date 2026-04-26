## Diagnóstico

O erro "Edge Function returned a non-2xx status code" está quebrando **todos os checkouts do plano semanal** (R$ 6,90 / 9,90 / 19,90).

Causa raiz, confirmada nos logs do Stripe:
```
Received unknown parameter: payment_method_options[card][mandate_options]
```

Foi introduzido no último reforço MIT que fizemos em `supabase/functions/create-checkout/index.ts`. O Stripe **não aceita `mandate_options` em `card` no modo `payment`** fora da Índia — é um parâmetro exclusivo de SetupIntent ou de métodos específicos (India card, AU BECS). A própria flag `supported_types: ['india']` que coloquei já era um sinal de que o reforço não era universal.

Os outros dois reforços daquela mesma rodada **continuam válidos e devem ficar**:
- `payment_intent_data.setup_future_usage: 'off_session'` → este é o reforço MIT real
- `payment_intent_data.statement_descriptor_suffix: 'SEMANAL'` → padrão de fatura
- `request_three_d_secure: 'automatic'` → política 3DS já documentada

## Correção

Em `supabase/functions/create-checkout/index.ts`, dentro do branch `if (trial) { ... }`, simplificar `payment_method_options.card`:

De:
```ts
sessionConfig.payment_method_options = {
  card: {
    request_three_d_secure: 'automatic',
    mandate_options: { ... }, // ← REMOVER
  },
};
```

Para:
```ts
sessionConfig.payment_method_options = {
  card: {
    request_three_d_secure: 'automatic',
  },
};
```

Manter intactos:
- `payment_intent_data.setup_future_usage: 'off_session'`
- `payment_intent_data.statement_descriptor_suffix`
- `payment_intent_data.description` e `metadata`
- Toda a lógica anti-duplicação, busca de customer, line_items com product_data inline

## Validação

1. Deploy da função `create-checkout`.
2. Tail dos logs por 1-2 minutos confirmando que novos checkouts retornam `Checkout session created` sem o erro `Received unknown parameter`.
3. Atualizar `mem://technical/stripe/mit-mandate-reinforcement` removendo o item "mandate_options" da lista de reforços e marcando-o como inválido para Brasil/cartão.

## Impacto esperado

- Restabelece 100% dos checkouts do plano semanal imediatamente.
- Zero perda de proteção MIT real — o `setup_future_usage: 'off_session'` é o que de fato estabelece o mandato off-session que o webhook reusa ao criar a Subscription.
