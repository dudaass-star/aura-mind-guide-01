

## Diagnóstico — 3 bugs críticos confirmados

Comparei o código do dashboard com a realidade do Stripe e encontrei 3 problemas que distorcem totalmente os números:

### 🐛 Bug #1: Semanal R$ 0,00 — assinaturas em trial são ignoradas

O dashboard busca apenas Stripe status `active` e `past_due`. Mas no plano semanal, os 7 primeiros dias ficam com status `trialing` no Stripe (não `active`). Confirmei direto na API:
- **25 assinaturas `active`** (mensais já convertidas) → contam como Comprometido ✅
- **10+ assinaturas `trialing`** (plano semanal corrente) → **NÃO CONTAM** ❌
- Dos 44 planos semanais que apareceram no log, todos os ativos hoje estão em `trialing`

Por isso "Semanal anualizado" aparece R$ 0,00 e o card "44 ativos" do log não bate com os 0 do dashboard.

### 🐛 Bug #2: "Em risco (past_due)" mostra R$ 818 mas só temos 17 — conta como `monthly`

O código adiciona `PLAN_PRICES_MONTHLY` ao MRR At Risk para qualquer past_due, mesmo quando a assinatura usa price ID `weekly`. Como assinaturas semanais nunca ficam past_due (vão direto para canceled após falha), o número está inflado misturando ciclos.

### 🐛 Bug #3: "Em recuperação (<7d): 31" — query errada

O código usa `payment_failed_at >= sevenDaysBeforePeriodEnd` SEM filtrar status. Está contando qualquer perfil com `payment_failed_at` setado nos últimos 7 dias, independente se já recuperou, cancelou ou está realmente em dunning. O número correto seria ~10-13 (past_due reais no Stripe).

### 🐛 Bug bônus #4: Activation Rate usa coluna errada

`last_user_message_at` é atualizado a CADA mensagem, não na primeira. Então "primeira mensagem em ≤3 dias" na verdade está checando "mensagem mais recente caiu em ≤3 dias do cadastro", que é falso para qualquer usuário ativo há tempo. Precisa buscar o MIN(created_at) da tabela `messages` por user.

---

## Plano de correção

### Fase 1 — Corrigir MRR Semanal (raiz do problema)

Em `admin-engagement-metrics/index.ts` linha 709, mudar:
```ts
for (const status of ['active', 'past_due'] as const)
```
para incluir `trialing`:
```ts
for (const status of ['active', 'trialing', 'past_due'] as const)
```

E ajustar a lógica de classificação:
- `status === 'trialing'` + ciclo `weekly` → conta em `weeklyRevenueCents` (já é semanal pago)
- `status === 'trialing'` + ciclo `monthly/yearly` → ignora (é trial gratuito legado, não tem)
- `status === 'active'` + ciclo `weekly` → conta em `weeklyRevenueCents` (semanal renovando antes de virar mensal)
- `status === 'active'` + ciclo `monthly/yearly` → `mrrCommittedCents` ✅

### Fase 2 — Corrigir MRR At Risk (past_due)

Pegar o `unit_amount` real da assinatura ao invés do mapa fixo:
```ts
if (sub.status === 'past_due') {
  const realAmount = sub.items.data[0]?.price?.unit_amount || 0;
  const cycle = mapping.cycle;
  if (cycle === 'monthly') mrrAtRiskCents += realAmount;
  else if (cycle === 'yearly') mrrAtRiskCents += Math.round(realAmount / 12);
  else if (cycle === 'weekly') mrrAtRiskCents += Math.round(realAmount * 4.33);
}
```

### Fase 3 — Corrigir "Em recuperação"

Substituir a query do `paymentAtRiskCount` para usar Stripe direto: `pastDueSubscriptionsCount` que já calculamos. Remover query SQL bugada.

### Fase 4 — Corrigir Activation Rate

Trocar `last_user_message_at` pelo MIN real:
```ts
const { data: firstMessages } = await supabase
  .from('messages')
  .select('user_id, created_at')
  .eq('role', 'user')
  .order('created_at', { ascending: true });
// Map user_id → primeira mensagem
const firstMsgByUser = new Map();
for (const m of firstMessages || []) {
  if (!firstMsgByUser.has(m.user_id)) firstMsgByUser.set(m.user_id, m.created_at);
}
```
E usar isso pra calcular ativação real.

### Fase 5 — Validação visual

No dashboard adicionar:
- Sub-linha em "MRR Total" mostrando contagens: `25 mensais + 10 semanais = 35 assinaturas`
- Tooltip explicando "Trialing no Stripe = plano semanal pago"
- No card "Em risco" mostrar separado: `R$ X mensais + R$ Y semanais anualizados`

---

## Resultado esperado

```text
Antes:  R$ 1.137,50 (25 mensais)  | Semanal R$ 0,00     | Em risco R$ 818
Depois: R$ 1.350,00 aprox          | Semanal R$ 200-400  | Em risco real ~R$ 600
```

E no checklist final:
- ✅ Semanal aparece > 0 (10 trialing × 4.33 × R$6.90-19.90)
- ✅ At Risk reflete só as 13-17 past_due reais com valor correto por ciclo
- ✅ "Em recuperação" mostra número que bate com `pastDueSubscriptionsCount`
- ✅ Activation Rate usa primeira mensagem real, não a última

Sem alterações no banco. Sem migração. Apenas refatoração da edge function `admin-engagement-metrics` e ajustes pontuais no `AdminEngagement.tsx` para os tooltips.

