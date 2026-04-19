
O usuário quer entender retenção por **coorte temporal** — ou seja, dos clientes que assinaram, quantos % cancelaram em diferentes janelas (30d, 60d, 90d). Isso é uma métrica de **cohort retention / churn por idade da assinatura**, fundamental para entender:

1. Se o produto está retendo após o "wow inicial"
2. Onde está o ponto de maior fuga (churn no D7, D30, D60?)
3. LTV real por coorte

## Abordagem técnica

**Fonte de dados:** Stripe API (`subscriptions.list` com `status: 'all'`) — já temos infra na `admin-engagement-metrics`. Cada `subscription` tem:
- `created` (timestamp de criação)
- `canceled_at` (timestamp de cancelamento, se cancelada)
- `status` (ativa, cancelada, etc.)

**Cálculo por bucket:**
Para cada coorte (ex: assinaturas criadas entre 30-60d atrás):
- Total de assinaturas iniciadas
- Quantas foram canceladas dentro da janela (ex: até 30d depois de `created`)
- % = canceladas / total

**Buckets propostos:**
- **Churn em ≤7 dias** (dropoff trial → 1ª cobrança)
- **Churn em 8-30 dias** (1º mês completo)
- **Churn em 31-60 dias** (2º mês)
- **Churn em 61-90 dias** (3º mês)
- **Retenção 90d+** (sobreviventes)

Para garantir cohorts maduros, considerar apenas assinaturas com idade suficiente:
- Bucket "≤7d" → considera subs criadas há pelo menos 7 dias
- Bucket "≤30d" → considera subs criadas há pelo menos 30 dias
- Etc.

## Plano

### 1. Backend (`admin-engagement-metrics/index.ts`)
Adicionar uma seção que pagina TODAS as subscriptions do Stripe (status `all`, últimos ~180 dias para ter dados de 90d+) e calcula:

```ts
cohortRetention: {
  churn7d: { total: N, canceled: M, pct: X },
  churn30d: { total: N, canceled: M, pct: X },
  churn60d: { total: N, canceled: M, pct: X },
  churn90d: { total: N, canceled: M, pct: X },
}
```

Onde para cada bucket:
- `total` = subs criadas há ≥ Nd
- `canceled` = subs do total que foram canceladas dentro de Nd da criação

### 2. Frontend (`AdminEngagement.tsx`)
Novo card **"Retenção por Coorte"** com 4 mini-cards lado a lado:

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Churn ≤7d    │ Churn ≤30d   │ Churn ≤60d   │ Churn ≤90d   │
│ 12%          │ 28%          │ 35%          │ 41%          │
│ 5/42 subs    │ 14/50 subs   │ 21/60 subs   │ 28/68 subs   │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Com tooltip explicando:
- "% de assinaturas canceladas dentro de N dias após contratação"
- Cor: verde (<15%), amarelo (15-30%), vermelho (>30%)

### 3. Sem mudança de banco
Tudo derivado da Stripe API em tempo real. Stripe é fonte da verdade.

## Resposta concisa para o usuário

**Sim, ótima métrica.** Vai te mostrar:
- Em qual fase da jornada o cliente desiste (D7 = problema de onboarding/expectativa; D30 = problema de valor percebido; D60+ = problema de hábito/engajamento)
- Te dá um benchmark para LTV real

Vou adicionar 4 buckets (≤7d, ≤30d, ≤60d, ≤90d) com % de churn e contagem absoluta.
