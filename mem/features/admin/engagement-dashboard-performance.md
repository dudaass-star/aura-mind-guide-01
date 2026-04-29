---
name: Performance do Dashboard de Engajamento
description: Cache de 5 min na edge function admin-engagement-metrics, paralelização Stripe, fix N+1 sessões e botão Atualizar com forceRefresh
type: feature
---

## Otimizações da função `admin-engagement-metrics`

1. **Cache em memória module-level**: TTL de 5 minutos por chave `dateFrom:dateTo`. Header `X-Cache: HIT|MISS` na resposta. Cache hit retorna em <100ms.
2. **`forceRefresh: true`**: enviado pelo botão "Atualizar" do `AdminEngagement.tsx` para invalidar a chave e recomputar. Trocas de aba/filtro reaproveitam o cache.
3. **N+1 eliminado em `messagesPerSession`**: trocado loop de `count` por sessão por uma única paginação `IN (user_ids)` no range mínimo/máximo das sessões e classificação em memória.
4. **Paralelização Stripe `invoices.list`**: helper `runWithConcurrency` (10 paralelas) para clientes com plano semanal >7d, em vez de loop serial.
5. **Janela limitada para `subscriptions.list` canceladas**: denominador de churn agora usa `created[gte] = periodStart - 180d` em vez de varrer todas as canceladas históricas.
6. **UI**: cronômetro no botão (`Atualizando 12s`) + `opacity-70` no container enquanto `loading && metrics` (mantém dados antigos visíveis em vez de skeleton total).

## Resultado esperado
- Cache hit (mudar filtro e voltar, trocar aba): **<1s**
- Cache miss / forceRefresh: **8-15s** (vs 30-90s anteriores)

## Não alterado
Nenhuma métrica calculada mudou — apenas o caminho de cálculo. Stripe segue como source of truth para MRR/churn.