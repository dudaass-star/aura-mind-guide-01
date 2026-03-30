

## Corrigir erro `request_three_d_secure: 'always'`

### Problema
Os logs mostram claramente:
```
Invalid payment_method_options[card][request_three_d_secure]: must be one of any, challenge, or automatic
```

O valor `'always'` nao e valido para Checkout Sessions. Os valores aceitos sao: `any`, `challenge`, ou `automatic`.

### Correcao
No arquivo `supabase/functions/create-checkout/index.ts`, linha 163:
- Trocar `request_three_d_secure: 'always'` por `request_three_d_secure: 'any'`

O valor `'any'` forca o 3DS sempre que o banco suportar, que e o comportamento desejado.

### Arquivo alterado
- `supabase/functions/create-checkout/index.ts` -- linha 163: `'always'` -> `'any'`

