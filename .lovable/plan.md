## Diagnóstico

A função `admin-engagement-metrics` faz **muito trabalho síncrono em sequência** numa única edge function. Os principais gargalos hoje são:

1. **Stripe sequencial e exaustivo** (a parte mais lenta — fácil 30-90s):
   - `stripe.charges.search` paginando até o fim para 3 amounts (690/990/1990).
   - Para cada cliente >7d, chama `stripe.invoices.list` (loop serial — N requests).
   - Lista TODAS as `subscriptions` (`active` + `trialing` + `past_due`) paginadas.
   - Lista TODAS as subs `canceled` para calcular o denominador de churn.
   - Tudo isso roda **sempre que você clica em atualizar**, mesmo só pra mudar 1 dia de filtro.

2. **Supabase paginação manual** (`fetchAllPaginated`) varrendo `messages` e `token_usage_logs` inteiros do período.

3. **N+1 em `messagesPerSession`**: um `count` por sessão completada (pode virar centenas de queries).

4. **Sem cache**: cada clique reprocessa tudo do zero.

## Plano

### 1. Cache em memória com TTL (ganho imediato — clicks repetidos viram instantâneos)

Guardar o resultado por chave `dateFrom:dateTo` por **5 minutos** dentro da edge function (variável module-level). Adicionar parâmetro opcional `forceRefresh: true` para o botão "Atualizar" forçar recomputo quando o usuário realmente quer.

Resultado: navegar entre abas / reabrir página = resposta em <1s.

### 2. Paralelizar os 3 grandes blocos independentes

Hoje rodam em série: `Engagement` → `Cost` → `Trial` → `Billing` → `Cancellation` → `Weekly Plans (Stripe)` → `Checkout` → `MRR (Stripe)`.

Envolver em `Promise.all([engagementBlock(), costBlock(), trialBlock(), stripeBlock(), checkoutBlock()])`. O bloco Stripe (de longe o mais pesado) já roda em paralelo aos blocos de DB.

### 3. Reduzir trabalho do Stripe

- **Unificar as 4 chamadas separadas de `subscriptions.list`** (active, trialing, past_due, canceled) — hoje churn denominador faz outra rodada completa só pra contar. Usar a lista já carregada do bloco MRR + uma única busca extra de `canceled` filtrada por `created[gte]`.
- **Paralelizar `stripe.invoices.list` por cliente** com `Promise.all` em batches de 10 ao invés do loop serial.
- **Dropar a busca de `canceled` por `created < periodStart`** sem `limit` no tempo — hoje pode varrer milhares de subs antigas. Usar `created[gte]: periodStart - 90d` (90 dias é suficiente para qualquer churn analytics).

### 4. Substituir N+1 de `messagesPerSession` por agregação única

Trocar o loop por uma única query agregando todas as mensagens dos usuários com sessões completadas no período (já que `periodUserMessages` JÁ está em memória). Calcular tudo client-side em JS ao invés de 1 count por sessão.

### 5. Spinner e feedback no botão

No `AdminEngagement.tsx`:
- Mostrar tempo decorrido no botão ("Atualizando... 12s") para o usuário saber que está vivo.
- Manter dados antigos visíveis com leve opacidade enquanto recarrega (em vez de skeleton total) — percepção muito melhor.

## Arquivos afetados

- `supabase/functions/admin-engagement-metrics/index.ts` — refatoração de cache, paralelização, fix N+1.
- `src/pages/AdminEngagement.tsx` — botão "Atualizar" passa `forceRefresh: true`, indicador de tempo, mantém dados durante reload.

## Resultado esperado

| Cenário | Antes | Depois |
|---|---|---|
| 1ª carga (cache vazio) | 30-90s | **8-15s** |
| Clique em "Atualizar" (force refresh) | 30-90s | **8-15s** |
| Mudar filtro de data e voltar | 30-90s | **<1s** (cache hit) |
| Trocar de aba e voltar | 30-90s | **<1s** (cache hit) |

Sem mudar nenhuma métrica — só otimizando como elas são calculadas.