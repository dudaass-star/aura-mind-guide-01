# Robustecer fluxo de início de sessão agendada

## Problema
62% das sessões agendadas terminam como `cancelled`/`no_show`. O fluxo tem 3 pontos frágeis:

1. **Gatilho único T-5min** — se o cron atrasa ou o template falha, o `pending_insight = [SESSION_START]<id>` nunca é setado e a sessão nunca inicia.
2. **Confirmação T-24h não pré-arma a sessão** — se o usuário confirma 24h antes ou manda mensagem entre T-24h e T-5min próximo do horário, nada acontece.
3. **Timeout rígido de 30min** — usuário que responde T+35min entra em conversa livre, sessão vira `no_show` mesmo com intenção clara.

## O que vai ser feito (ordem de prioridade)

### 1. Pré-armar sessão na confirmação T-24h (maior impacto)
Quando o usuário confirma no template T-24h, gravar `pending_insight = [SESSION_PREARM]<id>` em vez de só marcar `confirmation_requested = true`.

No `aura-agent`, ao detectar `[SESSION_PREARM]<id>`:
- Se faltam ≤15min para `scheduled_at` OU já passou ≤30min → inicia sessão imediatamente (mesma lógica do `[SESSION_START]`).
- Se ainda falta muito → mantém pré-armada, responde naturalmente.

### 2. Janela ampliada e idempotente para o lembrete T-5min
- `session-reminder` busca sessões com `scheduled_at` entre `now-2min` e `now+10min` (em vez de janela estreita).
- Idempotência via `reminder_5m_sent = true` (coluna já existe).
- Se envio do template falhar, **não** marcar `reminder_5m_sent` — permite retry no próximo tick.

### 3. Grace period 30min → 60min
- Usuário pode iniciar até T+60min com `[SESSION_START]` ou `[SESSION_PREARM]` ativo.
- Sessões só viram `cancelled` após T+60min sem interação.

### 4. Auditar `started_at < scheduled_at`
- Investigar o(s) caso(s) detectados.
- Adicionar guard: nunca setar `started_at` se `scheduled_at > now() + 5min`.

## Detalhes técnicos

**Arquivos afetados:**
- `supabase/functions/session-reminder/index.ts` — janela ampliada T-5min, lógica de pré-arme T-24h.
- `supabase/functions/aura-agent/index.ts` — handler `[SESSION_PREARM]`, grace 60min, guard `started_at`.
- `supabase/functions/process-webhook-message/index.ts` — fast-path para clique no botão `aura_session_reminder_v2` (padrão Trigger+Deliver).

**Sem migrations** — colunas `pending_insight`, `reminder_5m_sent`, `confirmation_requested`, `user_confirmed` já existem.

**Verificação pós-deploy:** monitorar por 48h taxa `completed` vs `cancelled`, presença de `[SESSION_PREARM]` em logs, query de `started_at < scheduled_at`.

## O que NÃO muda
- Template `aura_session_reminder_v2` e ContentSid permanecem iguais.
- Cron do `session-reminder` permanece igual (só a janela fica mais tolerante).
- Bloco "🚀 SESSÃO TERAPÊUTICA INICIADA" no prompt permanece igual.
