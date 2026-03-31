

# Plan: Optimize Proactive Messaging Frequencies

## Current State (from cron jobs)

| Function | Cron | Schedule |
|---|---|---|
| `weekly-report` | jobid 3 | Sundays 19h BRT |
| `pattern-analysis` | jobid 18 | Thu + Sat 11h BRT |
| `scheduled-checkin` | No cron | Not scheduled (dead code) |
| `reactivation-check` | No cron | Not scheduled |

## Changes

### 1. `scheduled-checkin` — Check-in 1x/mês após 7 dias sem mensagem

Rewrite the function logic:
- Query only users where `last_message_date < now() - 7 days`
- Add a new column `last_checkin_sent_at` to profiles (or reuse `last_reactivation_sent`) to enforce 1x/month limit: skip if `last_checkin_sent_at` was within last 30 days
- After sending, update `last_checkin_sent_at`
- Create a cron job to run daily at 14:00 UTC (11h BRT) — the function itself filters eligibility

**DB migration**: Add `last_checkin_sent_at timestamptz` column to profiles.

### 2. `weekly-report` → Monthly report

- Update cron job (jobid 3): change schedule from `0 22 * * 0` (every Sunday) to `0 22 1 * *` (1st of each month)
- Update the function code to calculate metrics for the past 30 days instead of 7 days (change `weekStart` calculation and label text from "semana" to "mês")

### 3. `pattern-analysis` — 1x/semana

- Update cron job (jobid 18): change from `0 14 * * 4,6` (Thu + Sat) to `0 14 * * 4` (Thursday only)
- The function already has a 7-day cooldown per user (`last_proactive_insight_at`), so no code change needed

### 4. `reactivation-check` — Remove re-engagement section

- Remove Section 2 entirely ("DETECTAR USUÁRIOS INATIVOS 3+ dias") — lines ~230-340
- Keep Section 0 (trial nudges) and Section 1 (missed sessions) intact
- No cron job exists for this function, so no cron change needed

### 5. No whatsapp-provider migration (as requested)

## Implementation Steps

1. **DB migration**: Add `last_checkin_sent_at` column to profiles
2. **Edit `scheduled-checkin/index.ts`**: Filter for 7+ days without message AND 30+ days since last check-in
3. **Edit `weekly-report/index.ts`**: Change period from 7 days to 30 days, update text labels
4. **Edit `reactivation-check/index.ts`**: Remove Section 2 (inactive user re-engagement)
5. **SQL (non-migration)**: Update cron jobs — weekly-report to monthly, pattern-analysis to 1x/week, add scheduled-checkin daily cron
6. No code changes needed for pattern-analysis (already has 7-day cooldown)

