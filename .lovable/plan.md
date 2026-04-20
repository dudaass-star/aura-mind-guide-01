

## Fix — Margem usando custo mensalizado

### O problema (recap)

- **MRR**: snapshot mensal (não muda com filtro de período)
- **Custo IA**: soma do período filtrado (7d, 30d, 90d…)
- **Margem atual**: `MRR − custoDoPeríodo` → escalas diferentes, número enganoso

### A correção

Normalizar o custo para uma janela de 30 dias antes de calcular a margem:

```
custoMensalizado = (custoDoPeríodo / diasDoPeríodo) × 30
margem           = MRR − custoMensalizado
margemPct        = margem / MRR
```

Assim a margem fica **estável** independente do filtro escolhido (7d/30d/90d) — o que é o comportamento correto, já que tanto MRR quanto margem são métricas de run rate mensal.

---

### Backend — `supabase/functions/admin-engagement-metrics/index.ts`

1. Após calcular `totalCostBRL` e ter `periodDays` disponível, adicionar:
   ```ts
   const totalCostMonthlyBRL = periodDays > 0
     ? Math.round((totalCostBRL / periodDays) * 30 * 100) / 100
     : 0;
   ```

2. Substituir o cálculo atual de margem para usar `totalCostMonthlyBRL`:
   ```ts
   const grossMarginBRL = Math.round((mrrTotalBRL - totalCostMonthlyBRL) * 100) / 100;
   const grossMarginPct = mrrTotalBRL > 0
     ? Math.round((grossMarginBRL / mrrTotalBRL) * 1000) / 10
     : 0;
   ```

3. Adicionar `totalCostMonthlyBRL` e `periodDays` ao payload de retorno (transparência).

---

### Frontend — `src/pages/AdminEngagement.tsx`

1. **Interface `EngagementMetrics`**: adicionar `totalCostMonthlyBRL?: number` e `periodDays?: number`.

2. **Card "Margem"**: atualizar subtítulo e adicionar tooltip:
   ```
   Subtítulo: "MRR mensal − custo IA mensalizado"
   Tooltip:   "Custo do período (R$ X em N dias) projetado para 30d = R$ Y/mês"
   ```

3. **Notas de metodologia**: reescrever a nota da Margem:
   > **Margem de contribuição:** MRR mensal menos custo de IA mensalizado (custo do período × 30 ÷ dias do período). Garante que ambos os lados estão na mesma escala temporal e que a margem fica estável independente do filtro de data.

---

### O que NÃO muda

- Card "💰 Custo total" continua mostrando o custo bruto do período filtrado (correto para análise pontual)
- "Custo médio diário" não muda
- MRR, ARR, ARPU, MRR Growth, Cohort, Churn, Tempo até churn — tudo intacto

---

### Resultado esperado

Com filtro de 7 dias e custo de R$ 7/semana:
- **Antes:** Margem R$ 1.930 (99,6%) — irreal
- **Depois:** custoMensalizado = R$ 30, Margem R$ 1.907 (98,4%) — honesto

Trocando o filtro para 30d ou 90d, a margem ficará praticamente igual (a base é sempre mensalizada).

---

### Plano de execução

1. 3 ajustes no backend (~6 linhas em `admin-engagement-metrics/index.ts`)
2. Atualizar interface + texto/tooltip do card Margem (`AdminEngagement.tsx`)
3. Redeploy da função
4. Verificar no painel que a margem fica estável trocando entre filtros 7d/30d/90d

