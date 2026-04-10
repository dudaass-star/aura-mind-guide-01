

## Plano: Corrigir contagem de Planos Semanais usando Stripe como fonte de verdade

### Problema
O banco de dados (`checkout_sessions` e `profiles.trial_started_at`) conta 43 telefones únicos, mas o Stripe mostra apenas **23 cobranças** reais nos valores de R$6,90 / R$9,90 / R$19,90. A diferença ocorre porque `checkout_sessions` registra TODOS os checkouts (incluindo assinaturas diretas e sessões duplicadas), e `trial_started_at` inclui modelos antigos de R$1,00.

### Solução
Consultar a API do Stripe diretamente na edge function para buscar cobranças (`charges`) com valores exatos de 690, 990 e 1990 centavos. Desduplicar por `customer` para obter o número real de pessoas em planos semanais.

### Alterações

**1. Edge Function: `admin-engagement-metrics/index.ts`**
- Importar Stripe SDK
- No bloco "TRIAL-TO-PAID METRIC", substituir as queries ao `profiles` por:
  - Listar charges no Stripe com `amount` em [690, 990, 1990], paginando se necessário
  - Desduplicar por `customer` ID → total de planos semanais (deve dar 23)
  - Para cada customer, buscar o `phone` nos metadados e cruzar com `profiles` para verificar quais converteram (status `active`/`canceled`/`canceling`)
  - Separar os que foram cobrados há mais de 7 dias (elegíveis para conversão)
- Retornar: `trialsCompletedWeek` (semanais +7d), `trialsToPaidSuccess` (convertidos), `trialToPaidRate`, e novo campo `totalWeeklyPlans` (total all-time = 23)

**2. Frontend: `src/pages/AdminEngagement.tsx`**
- Adicionar card "Total Planos Semanais" mostrando o total all-time
- Manter os cards "Semanais +7d", "Cobrados com Sucesso" e "Taxa Semanal→Mensal"
- Atualizar subtitles para clareza

### Resultado esperado
- Total Planos Semanais: **23** (conforme Stripe)
- Semanais +7d: subconjunto dos 23 cujo charge foi há mais de 7 dias
- Cobrados com sucesso: desses, os que têm status active/canceled/canceling no profiles
- Taxa: cobrados / semanais+7d * 100

