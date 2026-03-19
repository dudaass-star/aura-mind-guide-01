

## Problema

Existem **dois fluxos de trial** no sistema, e as métricas estão contando o fluxo errado:

- **Fluxo antigo** (`start-trial`): grava `trial_started_at`, mas `plan = null`. Sem cartão.
- **Fluxo novo** (Stripe checkout): grava `plan` e `status = trial`, mas **não grava `trial_started_at`**.

A query de métricas usa `trial_started_at IS NOT NULL` como filtro, pegando apenas trials legados (sem cartão). Os 3 trials reais do dia 18 (Carol, Tânia, Ana Livia) têm `plan` preenchido mas `trial_started_at = null`, e por isso não aparecem.

Dados reais no banco:
- 3 trials com cartão: essencial (2), direcao (1)
- 21 perfis com plano definido no total (incluindo ativos e cancelados)
- 72 trials legados sem plano (devem ser ignorados)

## Solução — 3 alterações

### 1. Stripe Webhook — gravar `trial_started_at` nos trials
**`supabase/functions/stripe-webhook/index.ts`**

Quando `isTrial === true`, adicionar `trial_started_at: new Date().toISOString()` no insert e no update do perfil. Isso alinha o fluxo novo com o campo que as métricas usam.

### 2. Edge Function — filtrar apenas trials com cartão
**`supabase/functions/admin-engagement-metrics/index.ts`**

Adicionar `.not('plan', 'is', null)` em todas as queries de trial para excluir os 72 trials legados sem plano. Queries afetadas:
- `activeTrials`
- `trialsLast7Days` / `trialsLast30Days`
- `totalTrialsEver`
- `trialRespondedCount`
- `convertedCount`
- `nonConvertedProfiles`
- `expiredTrials`

Também usar `created_at` como fallback quando `trial_started_at` for null (para trials com cartão que entraram antes do fix).

Adicionar nova query `trialsByPlan`: agrupar perfis com `status IN ('trial', 'active')` e `plan IS NOT NULL` por plano no período.

### 3. Frontend — exibir distribuição por plano
**`src/pages/AdminEngagement.tsx`**

Adicionar campo `trialsByPlan` na interface `Metrics` e renderizar um card simples na aba Trial mostrando a contagem por plano (Essencial, Direção, Transformação).

### Correção retroativa dos 3 trials existentes

Executar um UPDATE via migration para preencher `trial_started_at = created_at` nos perfis que têm `plan IS NOT NULL` e `status = 'trial'` e `trial_started_at IS NULL`.

