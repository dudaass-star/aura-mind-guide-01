

## Problema

Os trials do dia 18/03 aparecem zerados porque o horario UTC deles (00:24 a 01:28 UTC) cai **antes** do `startOfDay` convertido para UTC pelo navegador brasileiro (03:00 UTC). O frontend usa `startOfDay(date).toISOString()` que no fuso Brasil (UTC-3) gera `2026-03-18T03:00:00Z`, excluindo registros entre 00:00-02:59 UTC.

Dados reais no banco:
- 5 trials com `trial_started_at` entre `2026-03-18T00:24Z` e `2026-03-18T01:28Z`
- 10 usuarios ativos, 247+ mensagens no dia 18

## Causa raiz

`startOfDay()` e `endOfDay()` do date-fns operam no fuso local do navegador. Quando convertidos com `.toISOString()` para UTC, o intervalo fica deslocado em 3 horas, cortando registros da madrugada UTC.

## Solucao

Enviar as datas como strings de data pura (`YYYY-MM-DD`) ao inves de timestamps UTC. A edge function constroi os limites UTC-agnósticos usando o dia completo (00:00:00Z a 23:59:59Z).

### Alteracoes

1. **`src/pages/AdminEngagement.tsx`** — Enviar `dateFrom` e `dateTo` como `format(date, 'yyyy-MM-dd')` no body da request, sem `startOfDay/endOfDay/toISOString`

2. **`supabase/functions/admin-engagement-metrics/index.ts`** — Receber strings `YYYY-MM-DD` e construir:
   - `periodStart = dateFrom + 'T00:00:00Z'`
   - `periodEnd = dateTo + 'T23:59:59.999Z'`

Isso garante que dia 18/03 sempre cobre de `2026-03-18T00:00:00Z` a `2026-03-18T23:59:59Z`, incluindo todos os registros.

