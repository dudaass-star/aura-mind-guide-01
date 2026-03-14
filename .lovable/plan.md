

## Diagnóstico Final

Os logs confirmam: `"Raw current_period_end value - {"type":"undefined"}"`. O campo `subscription.current_period_end` retorna **undefined**.

**Causa raiz**: A partir da API Stripe versão `2025-03-31.basil`, os campos `current_period_start` e `current_period_end` foram **removidos** do objeto Subscription e movidos para `subscription.items.data[0].current_period_start` e `subscription.items.data[0].current_period_end`.

O código usa `apiVersion: "2025-08-27.basil"`, que é posterior a essa mudança.

## Correção

**Arquivo**: `supabase/functions/cancel-subscription/index.ts`

Alterar todas as referências a `subscription.current_period_end` para usar `subscription.items.data[0].current_period_end`. Mesma lógica para `cancelingSub.current_period_end`.

Pontos de alteração:
1. **Linha 135-136** (cancelingSub): `cancelingSub.current_period_end` → `cancelingSub.items.data[0].current_period_end`
2. **Linha 169-171** (subscription ativa): `subscription.current_period_end` → `subscription.items.data[0].current_period_end`

Manter a conversão defensiva (typeof check) já implementada.

