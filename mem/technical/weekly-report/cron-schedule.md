---
name: Cadência de cron do weekly-report e monthly-report
description: weekly-report roda todo domingo 10h BRT (cron 0 13 * * 0). monthly-report roda dia 1 do mês 22h UTC (cron 0 22 1 * *). Ambos chamam a mesma edge function weekly-report.
type: feature
---

A função `weekly-report` é compartilhada entre dois ciclos. O agendamento é controlado por dois cron jobs distintos no `cron.job`:

- **Semanal**: `weekly-report-sunday-10am-brt` → schedule `0 13 * * 0` → todo domingo 13h UTC = **10h BRT**.
- **Mensal**: `monthly-report` → schedule `0 22 1 * *` → dia 1 do mês, 22h UTC.

Ambos invocam `https://<project>.functions.supabase.co/weekly-report` com body `{}`. A função decide o `weekStart` automaticamente (últimos 7 dias).

Histórico: o cron semanal foi removido por engano em algum momento e só o mensal sobrou — usuários deixaram de receber o resumo aos domingos. Recriado em 27/04/2026 (jobid 35).

Disparo individual para teste/reenvio: `supabase.functions.invoke('weekly-report', { body: { target_user_id: '<uuid>' } })`.
