

## Fase 2 — Métricas adicionais de Saúde do Negócio

Pegando o gancho da Fase 1 (MRR + Cohort + Churn corrigidos), agora adiciono as 5 métricas que ficaram pendentes para fechar o quadro de receita.

---

### O que será adicionado

| # | Métrica | Cálculo | Onde virá |
|---|---|---|---|
| 1 | **ARR** (Annual Run Rate) | `mrrTotalBRL × 12` | Derivada do MRR já existente |
| 2 | **ARPU** (Avg Revenue Per User) | `mrrTotalBRL / activeSubscriptionsCount` | Derivada |
| 3 | **MRR Growth** (período) | `novoMRR − churnMRR` nos últimos 30d | Stripe: subs criadas no período × valor + subs canceladas × valor que tinham |
| 4 | **Margem de contribuição** | `mrrTotalBRL − totalCostBRL` (mensal) e % | Já temos os 2 lados, só faltava cruzar |
| 5 | **Tempo médio até churn** | Média de `(canceled_at − created) / dias` para subs canceladas nos últimos 90d | Stripe |

---

### Backend — `supabase/functions/admin-engagement-metrics/index.ts`

**Aproveita a paginação Stripe que já existe** para cohort retention (`status: 'all'`, últimos 180d). Numa única passada, calculo:

- **MRR Growth (30d):**
  - `newMRR` = soma de `unit_amount` (normalizado para mensal) das subs criadas nos últimos 30d que estão ativas/trialing/past_due
  - `churnedMRR` = soma de `unit_amount` (mensal) das subs canceladas nos últimos 30d
  - `mrrGrowth = newMRR − churnedMRR`
  - `mrrGrowthPct = mrrGrowth / mrrAtPeriodStart`

- **Tempo médio até churn:** média de `(canceled_at − created) / 86400` para subs canceladas nos últimos 90d (exclui canceladas no D0 que são duplicatas/lixo).

**Derivadas simples (no final, antes do `return`):**
```ts
const arrBRL = mrrTotalBRL * 12;
const arpuBRL = activeSubscriptionsCount > 0 
  ? Math.round(mrrTotalBRL / activeSubscriptionsCount * 100) / 100 
  : 0;
const grossMarginBRL = mrrTotalBRL - totalCostBRL;
const grossMarginPct = mrrTotalBRL > 0 
  ? Math.round((grossMarginBRL / mrrTotalBRL) * 1000) / 10 
  : 0;
```

Adicionar ao payload de retorno:
```
arrBRL, arpuBRL, mrrGrowthBRL, mrrGrowthPct, newMRRBRL, churnedMRRBRL,
grossMarginBRL, grossMarginPct, avgDaysUntilChurn, churnedSubsCount90d
```

---

### Frontend — `src/pages/AdminEngagement.tsx`

**1. Atualizar interface `EngagementMetrics`** com os 9 novos campos.

**2. Logo abaixo do Hero MRR, adicionar uma faixa de 4 mini-cards** (`grid-cols-2 md:grid-cols-4`):

```text
┌──────────┬──────────┬──────────────┬──────────┐
│ ARR      │ ARPU     │ MRR Growth   │ Margem   │
│ R$ X     │ R$ Y     │ +R$ Z (+W%)  │ R$ A (B%)│
│ projeção │ por sub  │ últimos 30d  │ mrr−custo│
└──────────┴──────────┴──────────────┴──────────┘
```

- **ARR**: cinza neutro, "projeção anualizada"
- **ARPU**: cor neutra
- **MRR Growth**: verde se positivo, vermelho se negativo, com tooltip mostrando `newMRR` vs `churnedMRR`
- **Margem**: verde se ≥ 70%, amarelo 40-70%, vermelho < 40%

**3. Adicionar um 5º card "Tempo médio até churn"** discretamente, dentro da seção de Cohort Retention existente (mesma linha, complementa o quadro):
```text
"Quem cancela, cancela em média no D{X} da assinatura."
"Baseado em N cancelamentos nos últimos 90d."
```

---

### Notas de metodologia (rodapé do card)

Adicionar 2 linhas no card "Notas":
- **MRR Growth:** soma do MRR de assinaturas novas (criadas em 30d) menos MRR perdido por cancelamentos no mesmo período.
- **Margem:** MRR total menos custo de IA do período. Positiva = receita cobre o custo direto.

---

### Sem mudanças

- Banco de dados: nada (tudo derivado do Stripe + cálculos)
- UI existente: preservada — só adiciono cards
- Performance: zero impacto (usa loops já existentes)

---

### Plano de execução

1. Adicionar cálculos no backend (1 arquivo, ~80 linhas adicionadas)
2. Atualizar interface e adicionar 4 mini-cards no frontend (1 arquivo)
3. Redeploy da função
4. Verificação final no painel `/admin/engajamento`

