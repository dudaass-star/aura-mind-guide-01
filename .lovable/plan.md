

## Recomendação técnica

Após analisar a documentação do Stripe e o comportamento atual da sua conta, a melhor prática é **alinhar o dashboard com o ciclo real de retry do Stripe (até ~30 dias)**, não com uma janela artificial de 7 dias.

### Por quê?

1. **Stripe Smart Retries roda por até 4 semanas** antes de cancelar/marcar como `unpaid`. Enquanto a assinatura está `past_due`, ela ainda é **recuperável** — não é churn ainda.
2. **Marcar como churn aos 7 dias** te faz "perder" R$ 600 de visibilidade (os 17 atuais) que ainda podem voltar via retry automático.
3. **Stripe é a fonte da verdade**: se o status é `past_due`, está em risco. Se virou `canceled`/`unpaid`, aí sim é churn involuntário.

### Plano recomendado (3 cards claros)

```text
┌─────────────────────────────┬─────────────────────────────┬─────────────────────────────┐
│ 🟡 Em risco (≤7d)           │ 🟠 Em risco crítico (>7d)   │ 🔴 Churn involuntário       │
│ Recuperável - dunning ativo │ Stripe ainda tentando       │ Cancelado/unpaid            │
│ R$ X (Y assinaturas)        │ R$ 600 (17 assinaturas)     │ Z assinaturas no mês        │
└─────────────────────────────┴─────────────────────────────┴─────────────────────────────┘
```

### Mudanças concretas

**`admin-engagement-metrics/index.ts`:**
- Calcular `daysSinceFailure` para cada `past_due`
- `≤7d` → `mrrAtRiskRecentCents` + `pastDueRecentCount`
- `>7d` (mas ainda `past_due` no Stripe) → `mrrAtRiskCriticalCents` + `pastDueCriticalCount`
- Buscar `canceled` no Stripe filtrando `cancellation_details.reason === 'payment_failed'` dos últimos 30 dias → `involuntaryChurnCount` real

**`AdminEngagement.tsx`:**
- Card "Em risco" mostra os 2 buckets (≤7d e >7d) lado a lado com cores distintas
- Card "Churn involuntário" passa a usar a contagem real do Stripe (`canceled` por falha de pagamento), não a estimativa atual
- Tooltip explicando: "Stripe tenta recuperar pagamentos por até 4 semanas antes de cancelar"

### Resultado esperado

```text
🟡 Em risco (≤7d):       R$ 0    | 0 assinaturas (nenhuma falhou esta semana)
🟠 Em risco crítico:     R$ 600  | 17 assinaturas (Stripe ainda tentando)
🔴 Churn involuntário:   R$ X    | N canceladas por falha nos últimos 30d
```

Sem mudança de banco, sem migração — apenas a edge function e o frontend.

