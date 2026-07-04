## Objetivo

Fazer o dashboard de Engajamento abrir **instantâneo** (<200ms) para janelas padrão (hoje, 7d, 30d, 90d), com defasagem máxima de 5 min. Filtros customizados continuam ao vivo.

## Diagnóstico

- Nada persistido. Cada abertura roda ~15 queries pesadas + Stripe API → 8-15s.
- "Cache" atual mora na memória da edge function → some no cold start.
- Índice no banco não resolveria: o custo é *agregar N mil linhas*, não filtrar; e MRR/churn vêm de API externa (Stripe).

## Solução

**Snapshot persistente em tabela + cron a cada 5 min.** Dashboard lê 1 linha JSON pronta.

```text
pg_cron 5min ─▶ edge fn snapshot ─▶ admin_metrics_snapshots (4 linhas)
                                              │
                        ┌─────────────────────┴──────────┐
                        ▼                                ▼
              AdminEngagement.tsx            admin-engagement-metrics
              (lê snapshot direto)           (fallback custom range)
```

## Mudanças

### 1. Tabela `public.admin_metrics_snapshots`
- Colunas: `window_key text PK` (`today|7d|30d|90d`), `date_from date`, `date_to date`, `payload jsonb`, `computed_at timestamptz`, `compute_ms int`.
- RLS: SELECT só admin (`has_role`), escrita só service role.
- GRANTs: SELECT para `authenticated`, ALL para `service_role`.

### 2. Nova edge function `admin-engagement-metrics-snapshot`
- Extrai a lógica de cálculo atual para `_shared/compute-metrics.ts` (evita duplicação).
- Loop pelas 4 janelas → upsert em `admin_metrics_snapshots`.
- Idempotente; segura em execução concorrente.

### 3. Cron a cada 5 min (`pg_cron` + `pg_net`)
- Job `admin-metrics-snapshot-5m` invoca a nova função com bearer service role.
- Criado via `supabase--insert` (contém URL + chave, não vai em migration).

### 4. Ajuste em `admin-engagement-metrics/index.ts`
- Se `dateFrom/dateTo` casa com janela padrão E `!forceRefresh` → retorna snapshot direto (`X-Cache: SNAPSHOT`, idade em ms).
- Se não casa OU snapshot >15 min stale → fluxo atual (compute + cache memória).
- `forceRefresh=true` (botão Atualizar) recomputa e reescreve o snapshot da janela correspondente.

### 5. Frontend `src/pages/AdminEngagement.tsx`
- Mostrar "atualizado há X min" usando `computed_at`.
- Sem outras mudanças de UX.

## Custo e rollback

- 4 janelas × 288 execuções/dia ≈ 1150 recomputos/dia. Bem dentro do razoável.
- Pior caso de frescor: ~5min15s.
- Rollback = desligar o cron; dashboard volta ao comportamento atual sem tocar em código.

## Fora de escopo

- Não pré-computo filtros customizados (baixo uso).
- Não mexo em cálculo Stripe individual — paralelização atual já é adequada.
- Sem realtime/subscribe.
