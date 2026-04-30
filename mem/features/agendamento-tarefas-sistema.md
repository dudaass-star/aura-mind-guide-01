---
name: Sistema de agendamento de tarefas (lembretes)
description: Lembretes pedidos via NLP, parser suporta absoluto e relativo, anti-dup por janela ±2min
type: feature
---
**Fluxo:**
1. Usuário pede ("me lembra em 5 min de X").
2. Aura confirma naturalmente ("Combinado, te lembro 💜").
3. Micro-agent (gemini-2.5-flash-lite) async via waitUntil extrai `schedule_reminder: { description, datetime_text }`.
4. `parseDateTimeFromText` interpreta `datetime_text` em BRT.
5. INSERT em `scheduled_tasks` (status=pending, task_type=reminder).
6. Worker `process-scheduled-tasks` roda a cada 5 min e despacha.

**Parser (parseDateTimeFromText):**
- RELATIVO (avaliado primeiro): "em N min/minutos", "daqui a N horas", "meia hora", "uma hora", "em N dias"
- ABSOLUTO: "HH:MM", "HHh", combinado com "amanhã", "segunda", "dia N", "hoje"
- Retorna `null` se não conseguir interpretar — gera warning explícito (nunca falha silenciosa).

**Anti-duplicata:** bloqueia apenas se já existir reminder com `status=pending` e `execute_at` dentro de ±2min do novo. Reminders executados/cancelados NÃO bloqueiam.

**Timezone (CRÍTICO):**
- Servidor roda em UTC; usuário fala em wall-clock BRT (UTC-3).
- **Relativo** ("em N min/h/dias"): use `Date.now() + delta`. Timezone é IRRELEVANTE — instante absoluto é o mesmo em qualquer fuso.
- **Absoluto** ("amanhã 22h"): use `setUTCHours(hour + 3, minute, 0, 0)` para converter BRT → UTC. NUNCA use `setHours()` — em UTC isso vira 22h UTC = 19h BRT (errado).
- **NUNCA** fabrique um Date "BRT-aware" via `new Date(Date.now() + offset*60*1000)`. Isso cria um objeto que mente sobre o instante real e quebra parsing relativo (lembrete "em 3min" vira passado, é descartado pela guarda anti-passado).
- Guarda anti-passado tolera 30s de slop (`parsed <= Date.now() - 30_000`) para suportar latência do extractor async em pedidos curtos.

**Bugs históricos corrigidos em 2026-04-30:**
1. Parser só aceitava horário absoluto (sem suporte a "em N min").
2. Guarda anti-dup checava 7 dias por created_at sem filtro de status — bloqueava qualquer reminder novo.
3. Shift de timezone fabricado (`Date.now() - 3h`) no callsite quebrava parser relativo: lembrete "em 3min" calculava `12:04 UTC` (= 09:04 BRT, passado) e era descartado. Solução: usar `new Date()` real e mover correção de timezone para dentro do parser absoluto via `setUTCHours(hour + 3, ...)`.
