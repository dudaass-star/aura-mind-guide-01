

## Adicionar métricas de cobrança (billing) no painel de engajamento

### O que será feito

Adicionar 3 indicadores na aba "Trial & Conversão" que mostram, **filtrados pelo período selecionado**:

1. **Cobrados no período** — quantos `invoice.payment_failed` + `invoice.paid` ocorreram (total de tentativas de cobrança)
2. **Cobranças com sucesso** — quantos `invoice.paid` ocorreram
3. **Taxa de sucesso** — % de sucesso

### Fonte de dados

A tabela `stripe_webhook_events` já registra todos os eventos com `event_type` e `processed_at`. Basta contar:
- `event_type = 'invoice.paid'` no período → sucesso
- `event_type = 'invoice.payment_failed'` no período → falha
- Total cobrados = paid + failed
- Taxa = paid / total * 100

### Mudanças

**1. Edge function `admin-engagement-metrics/index.ts`**
- Adicionar 2 queries contando `stripe_webhook_events` filtradas por `processed_at` no período:
  - `invoice.paid` → `billingSuccessInPeriod`
  - `invoice.payment_failed` → `billingFailedInPeriod`
- Calcular `billingTotalInPeriod` e `billingSuccessRate`
- Retornar os 3 campos no JSON de resposta

**2. Frontend `src/pages/AdminEngagement.tsx`**
- Adicionar os 3 campos na interface `Metrics`
- Renderizar um card/seção com os 3 indicadores na aba "Trial & Conversão", antes do funil de checkout
- Usar ícones `CreditCard` / `CheckCircle2` / `Percent` já importados

### Posição no layout

Os 3 indicadores aparecerão como cards em grid (3 colunas) no topo da aba "Trial & Conversão", antes do "Funil de Checkout".

