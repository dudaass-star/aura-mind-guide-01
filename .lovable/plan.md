

## Avaliação dos pontos levantados

Verifiquei cada ponto contra o código real. Veredito ponto a ponto:

---

### 🔴 Bug crítico #1 — MRR mensal hardcoded → **PROCEDE, mas com ressalva**

Linha 813:
```ts
const price = PLAN_PRICES_MONTHLY[plan] || 0;  // 2990/4990/7990 hardcoded
```

vs. yearly (linha 819) que usa `unit_amount` real.

**Procede.** Inconsistência real. Se tivermos cupom, preço legado ou A/B de preço, MRR fica errado. Hoje provavelmente bate por sorte, mas é frágil. Fix correto:
```ts
const price = sub.items.data[0]?.price?.unit_amount || PLAN_PRICES_MONTHLY[plan] || 0;
```

---

### 🟡 Bug crítico #2 — `apiVersion: '2025-08-27.basil'` → **NÃO PROCEDE como bug**

A avaliação diz "deveria ser '2023-10-16' como já fizemos no create-checkout". Verifiquei:

| Função | apiVersion |
|---|---|
| create-checkout, cancel-subscription, stripe-webhook, reprocess-dunning, reconcile-subscriptions | `2023-10-16` |
| admin-engagement-metrics, audit-stripe-duplicates, reengagement-blast, attach-checkout-payment-methods, fix-subscription-payment-methods, audit-recovered-payments | `2025-08-27.basil` |

`2025-08-27.basil` **é a versão estável atual** (a documentação da Lovable/Stripe inclusive recomenda essa). Não é "preview". O projeto está com **dois padrões convivendo** — isso é uma inconsistência cosmética, não um bug.

**Recomendação:** padronizar tudo em `2025-08-27.basil` (mais novo, mais features), OU manter `2023-10-16` nos paths críticos de pagamento e usar `basil` em ferramentas analíticas. Não é urgente. **Não vou mexer agora.**

---

### 🟡 Bug médio #3 — Activation Rate varre tabela `messages` inteira → **PROCEDE parcialmente**

Linhas 1027-1032:
```ts
const allUserMsgs = await fetchAllPaginated(
  supabase, 'messages', 'user_id, created_at',
  [{ column: 'role', op: 'eq', value: 'user' }]
);
```

**Procede.** Está paginando a tabela `messages` toda só para depois filtrar por `payingUserIds` em memória. Com a base crescendo (já temos milhares de mensagens), isso vai degradar.

**Fix simples:** adicionar `{ column: 'user_id', op: 'in', value: payingUserIds }` no filtro. Como Supabase tem limite de URL para `.in()` com listas grandes, fazer em chunks de 100 IDs se necessário.

---

### 🟡 Bug leve #4 — Churn denominator inclui já-cancelados → **PROCEDE**

Linha 507:
```ts
.in('status', ['active', 'canceling', 'canceled', 'paused', 'trial_expired', 'inactive'])
```

**Procede.** O denominador conta TODA a base histórica criada antes do período, incluindo quem já estava cancelado. Isso **subestima** o churn rate (denominador inflado).

**Limitação real:** sem snapshot histórico de status, não dá pra saber quem estava `active` em `periodStart`. A aproximação correta é:
- Denominador = `active + canceling` criados antes do período + cancelados DENTRO do período (que estavam ativos no início)
- OU usar Stripe como fonte (subscriptions ativas em uma data)

A 2ª opção é mais precisa. Vou usar Stripe.

---

## Decisão sobre o que aplicar

| # | Bug | Aplicar? |
|---|---|---|
| 1 | MRR mensal usar `unit_amount` real | ✅ Sim — fix de 1 linha, mais robusto |
| 2 | apiVersion padronização | ❌ Não — falso positivo, ambas são válidas |
| 3 | Activation: filtrar por `payingUserIds` | ✅ Sim — em chunks de 100 |
| 4 | Churn denominator | ✅ Sim — usar Stripe (subs ativas há 30d via `created < periodStart` AND `(canceled_at == null OR canceled_at >= periodStart)`) |

Sobre as **métricas adicionais sugeridas** (ARR, ARPU, MRR Growth, Margem, Tempo até churn): **todas fazem sentido**, mas são uma segunda fase. Sugiro implementar separado depois que os 3 fixes estiverem em produção.

---

## Plano de implementação

**Arquivo único:** `supabase/functions/admin-engagement-metrics/index.ts`

1. **Fix MRR mensal (linha 813)** — usar `unit_amount` do Stripe com fallback hardcoded.

2. **Fix Activation query (linhas 1024-1032)** — passar `payingUserIds` em chunks de 100 para o `fetchAllPaginated`, ou adicionar suporte a filtro `in` no helper. Resultado: query escaneia só mensagens dos pagantes, não a tabela toda.

3. **Fix Churn denominator (linha 505-509)** — substituir a query de profiles por contagem via Stripe:
   - Buscar subs com `created < periodStart` AND (`status === 'active'` OR (`status === 'canceled'` AND `canceled_at >= periodStart`))
   - Esse é o conjunto que estava ativo no início do período → denominador correto.
   - Atualizar `churnRate = churnCount / activeAtPeriodStart`.
   - Adicionar nota no card explicando a metodologia (Stripe = fonte da verdade).

4. **Redeploy** da função.

Não toco em UI — o fix é todo backend e os números vão simplesmente ficar mais corretos no card existente.

