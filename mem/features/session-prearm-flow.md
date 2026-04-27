---
name: Pré-arme de sessão na confirmação T-24h
description: Sessões agendadas usam SESSION_PREARM (confirmação T-24h) + SESSION_START (T-5min) com janela ampliada e grace de 60min para reduzir no-show
type: feature
---

Para reduzir no-show em sessões agendadas (era 62%), o fluxo de início ficou tolerante a falhas:

## Pré-arme via confirmação T-24h
- Quando o usuário responde "confirmo/sim/ok" ao lembrete T-24h em `process-webhook-message > handleSessionConfirmation`, além de `user_confirmed=true`, gravamos `pending_insight = [SESSION_PREARM]<sessionId>` (apenas se pending_insight estiver vazio — não atropela INSIGHT/WELCOME).
- No `aura-agent`, ao detectar `[SESSION_PREARM]`, avalia janela contra `scheduled_at`:
  - `> 15min` antes → mantém pré-arme, conversa normal.
  - entre `T-15min` e `T+60min` → **inicia sessão imediatamente** (mesma lógica do SESSION_START).
  - fora da janela (passou de T+60min) → limpa pré-arme, conversa normal.
- A limpeza final do `pending_insight` no aura-agent recarrega o estado para não sobrescrever um pré-arme mantido propositalmente.

## Janela ampliada T-5min
- `session-reminder` busca sessões com `scheduled_at` entre `now-2min` e `now+10min` (antes era `now → +5min`), tolerante a atrasos do cron.
- Idempotência reforçada: `reminder_5m_sent` só é marcado quando o envio do template é confirmado. Falha = retry no próximo tick.
- Não sobrescreve pending_insight se já houver outro marcador não-relacionado a sessão.

## Grace period 30 → 60 min
- Sessões `scheduled` viram `cancelled` apenas após T+60min sem interação.
- Sessões `in_progress` viram `no_show/completed` apenas 60min após o término previsto.

## Arquivos
- `supabase/functions/process-webhook-message/index.ts` — `handleSessionConfirmation` grava `[SESSION_PREARM]`.
- `supabase/functions/aura-agent/index.ts` — handler de `[SESSION_PREARM]` reusa lógica do `[SESSION_START]` com guarda de janela.
- `supabase/functions/session-reminder/index.ts` — janela T-5min ampliada, idempotência, grace 60min.
