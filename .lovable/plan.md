

## Corrigir erro no checkout — parâmetro inválido

### Problema
O parâmetro `mandate_options` que adicionamos não é suportado pela API de Checkout Sessions do Stripe. O erro exato é:
```
Received unknown parameter: payment_method_options[card][mandate_options]
```

### Correção
Remover `mandate_options` da configuração de checkout em `supabase/functions/create-checkout/index.ts`. O `request_three_d_secure: 'always'` e `setup_future_usage: 'off_session'` continuam funcionando e são suficientes para blindar as cobranças.

### Arquivo alterado
- `supabase/functions/create-checkout/index.ts` — Remover `mandate_options` dos blocos trial e subscription

