## Problema

O card "Último insight da Aura" no portal está lendo `profiles.pending_insight`. Esse campo **não é insight** — é um buffer técnico de entrega no WhatsApp que carrega prefixos como `[CONTENT]` (episódio de jornada), `[WEEKLY_REPORT]` (teaser), `[WELCOME]`, `[SESSION_PREARM]`, `[SESSION_START]`. Por isso aparece disparo de jornada no lugar de reflexão.

A Aura **continua mandando insights de verdade** via WhatsApp (cron `pattern-analysis-weekly` → efeito Oráculo) — o problema é só que o portal está mostrando o campo errado. Não é para desligar nada da régua.

## Solução

Trocar a fonte do card por ativos que já têm valor clínico curado:

1. **Fonte primária**: `thematic_snapshots` mais recente do usuário (já é síntese temática com citação literal, tier de confiança e período).
2. **Fallback**: `monthly_reports.analysis_text` mais recente (síntese mensal completa).
3. **Se nenhum existir**: esconder o card (sem placeholder falso).

`pending_insight` sai completamente do portal — nem como preferência, nem como fallback.

## Escopo técnico

### `src/pages/UserPortal.tsx`
- Remover `pending_insight` do `select` de `profile` (linha 79).

### `src/components/portal/HojeTab.tsx`
- Nova query `["portal-latest-insight", userId]` que busca:
  1. Último `thematic_snapshots` do user (`order by period_end desc limit 1`, filtrando `confidence_tier != 'insufficient'`).
  2. Se vazio, último `monthly_reports.analysis_text` (`order by created_at desc limit 1`).
- Montar objeto `{ kind: 'snapshot'|'monthly', title, body, meta }` — ex.:
  - snapshot → title = tema (`emotional_theme`), meta = período BRT.
  - monthly → title = "Resumo de {mês}", body = primeiros ~280 chars de `analysis_text`.
- `InsightPreviewCard` recebe `title` opcional além de `text`; label do header vira "Insight da Aura" (sem "Último", que induz a "última mensagem").
- Remover uso de `profile.pending_insight` como fonte.

### `src/components/portal/InsightsTab.tsx`
- Remover bloco `hasPendingInsight` / render de `profile.pending_insight` (linhas ~246–267). A aba já tem os capítulos (`thematic_snapshots` renderizados), então não perde nada.

### Sem mudanças em
- `pending_insight` no schema (continua sendo buffer legítimo do WhatsApp).
- `weekly-report`, `stripe-webhook`, `start-trial`, `aura-agent`, `session-reminder` (mantêm uso normal do buffer).
- Nenhum cron pausado.

## Validação

- Abrir `/meu-espaco` no perfil Eduardo via Playwright autenticado.
- Confirmar que o card mostra um snapshot temático (com citação) ou o resumo mensal — nunca texto começando com `[CONTENT]`/`[WEEKLY_REPORT]`/link `olaaura.com.br/meu-espaco/...`.
- Verificar que a aba "Percurso" também não mostra mais o buffer.