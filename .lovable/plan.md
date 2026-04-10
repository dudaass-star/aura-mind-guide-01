

## Plan: Metric "Trial-to-Paid Conversion Rate"

### What it measures
Of all users who completed their 7-day trial (trial_started_at older than 7 days), what percentage was successfully charged for the first monthly subscription.

### Logic
- **Denominator**: Profiles with `trial_started_at < now() - 7 days` AND `plan IS NOT NULL` (reached billing date)
- **Numerator**: Among those, profiles with `status IN ('active', 'canceled', 'canceling')` — these users were successfully charged at least once (impossible to reach these statuses without a paid invoice in the current flow)
- **Percentage**: numerator / denominator * 100

Current data snapshot: 28 trials past 7 days, 3 successfully charged (1 active + 2 canceled) = **10.7%**

### Changes

**1. Edge Function: `admin-engagement-metrics/index.ts`**
Add 3 new queries after the existing trial metrics:
- Count profiles with `trial_started_at < now() - interval '7 days'` AND `plan IS NOT NULL` → `trialsCompletedWeek`
- Count of those with `status IN ('active', 'canceled', 'canceling')` → `trialsToPaidSuccess`
- Calculate `trialToPaidRate` = percentage

Return 3 new fields: `trialsCompletedWeek`, `trialsToPaidSuccess`, `trialToPaidRate`

**2. Frontend: `src/pages/AdminEngagement.tsx`**
- Add 3 fields to the `Metrics` interface
- Add a card in the Trial & Conversion tab showing:
  - "Trials que completaram 7 dias" (denominator)
  - "Cobrados com sucesso" (numerator)  
  - "Taxa Trial→Pago" (percentage) as the highlight metric

