

## Reduzir Trial de 7 para 5 dias — Implementação

### Backend (4 arquivos)

**1. `supabase/functions/stripe-webhook/index.ts`**
- Linha 269: comment `7-day` → `5-day`
- Linha 273: `trial_period_days: 7` → `trial_period_days: 5`
- Linha 283: `"7 dias grátis — a primeira cobrança será apenas no 8º dia."` → `"5 dias grátis — a primeira cobrança será apenas no 6º dia."`

**2. `supabase/functions/process-webhook-message/index.ts`**
- Linha 289: `const sevenDays = 7 * 24 * 60 * 60 * 1000` → `const fiveDays = 5 * 24 * 60 * 60 * 1000`
- Linha 290: `if (trialAge > sevenDays)` → `if (trialAge > fiveDays)`

**3. `supabase/functions/cleanup-inactive-users/index.ts`**
- Linha 28-29: Ghost trials cutoff `7 * 24 * 60 * 60 * 1000` → `5 * 24 * 60 * 60 * 1000`, comment atualizado

**4. `supabase/functions/admin-engagement-metrics/index.ts`**
- Linha 277-278: `7 * 24 * 60 * 60 * 1000` → `5 * 24 * 60 * 60 * 1000`, comment `< 7 days` → `< 5 days`

**5. `supabase/functions/schedule-setup-reminder/index.ts`**
- Linhas 81-83: Segundo lembrete `5-7 days (120-168h)` → `3-5 days (72-120h)`

### Frontend (7 arquivos) — substituição de texto

| Arquivo | De | Para |
|---|---|---|
| `Hero.tsx` | "7 dias grátis", "primeiros 7 dias" | "5 dias grátis", "primeiros 5 dias" |
| `FinalCTA.tsx` | "7 dias grátis" (×2) | "5 dias grátis" |
| `FAQ.tsx` | "7 dias grátis", "primeiros 7 dias", "8º dia" | "5 dias grátis", "primeiros 5 dias", "6º dia" |
| `Demo.tsx` | "7 dias grátis" | "5 dias grátis" |
| `ForWho.tsx` | "7 dias grátis" | "5 dias grátis" |
| `Pricing.tsx` | "7 dias grátis" | "5 dias grátis" |
| `Checkout.tsx` | "7 dias" (×4) | "5 dias" |
| `AdminEngagement.tsx` | "< 7d", "> 7d", "7 dias" | "< 5d", "> 5d", "5 dias" |

### Não alterar
- `conversation-followup` (reengajamento semanal — funcionalidade diferente)
- `aura-agent` (dedup de tarefas — funcionalidade diferente)
- `admin-engagement-metrics` default date range de 7 dias (filtro do dashboard)

