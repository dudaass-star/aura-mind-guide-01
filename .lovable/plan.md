

## Filtrar métricas de cobrança para incluir apenas pagamentos reais (excluir trials)

### Problema

A tabela `stripe_webhook_events` registra apenas `id`, `event_type` e `processed_at` — sem valor do invoice. Isso significa que `invoice.paid` de trials com valor $0 (primeira cobrança do trial) também é contada, inflando os números.

### Solução

**Adicionar coluna `amount` na tabela `stripe_webhook_events`** e salvar o valor do invoice no momento do webhook. Depois, filtrar no edge function de métricas por `amount > 0`.

### Mudanças

**1. Migration: adicionar coluna `amount` à `stripe_webhook_events`**
```sql
ALTER TABLE public.stripe_webhook_events 
ADD COLUMN amount integer DEFAULT NULL;
```
(Stripe usa centavos, então `integer` é suficiente)

**2. `supabase/functions/stripe-webhook/index.ts`**
- No insert de idempotência (linha ~96), passar `amount: invoice.amount_paid` quando o evento for `invoice.paid` ou `invoice.payment_failed`
- Para outros tipos de evento, `amount` fica `null`

**3. `supabase/functions/admin-engagement-metrics/index.ts`**
- Nas queries de billing, adicionar filtro `.gt('amount', 0)` para contar apenas cobranças reais com dinheiro

**4. Backfill dos eventos existentes (opcional)**
- Os eventos já registrados ficarão com `amount = null`. Podemos tratar `null` como "desconhecido" e incluí-los nos contadores para não perder histórico, OU excluí-los. Recomendo incluir `null` no filtro temporariamente: `.or('amount.gt.0,amount.is.null')` até que novos eventos populem o campo.

### Resultado

- Cobranças de trial ($0) serão excluídas das métricas
- Apenas pagamentos reais (renovações, conversões pós-trial) serão contados

