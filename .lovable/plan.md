

# Adicionar Aba "Cancelamentos" ao Painel de Métricas

## O que muda

### Backend (`admin-engagement-metrics/index.ts`)
Adicionar 3 novos campos no response JSON:
- `canceledInPeriod`: COUNT de `cancellation_feedback` filtrado por `created_at` no período selecionado
- `churnRate`: `canceledInPeriod / activeUsersBase * 100`
- `cancellationReasons`: array `[{reason, action_taken, count}]` agrupado por motivo, filtrado pelo período

### Frontend (`AdminEngagement.tsx`)
- Expandir o `Metrics` interface com os 3 novos campos
- Mudar `TabsList` de `grid-cols-2` para `grid-cols-3`
- Adicionar nova aba **"Cancelamentos"** com:
  - **3 cards**: Cancelados no Período, Churn Rate (%), Total Cancelados (histórico — já existe `canceledUsers`)
  - **Card de motivos**: lista com `reason` e `action_taken` similar ao "Distribuição por Plano"
  - Exibe `cancelingUsers` (aguardando cancelamento) como card adicional

### Detalhes Técnicos
- A tabela `cancellation_feedback` tem `reason`, `reason_detail`, `action_taken`, `created_at` — tudo que precisamos
- Dados atuais: apenas 1 registro (motivo: `not_using`, ação: `canceled`)
- 2 arquivos editados: edge function + página admin

