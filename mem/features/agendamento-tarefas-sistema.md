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

**Bug histórico (corrigido em 2026-04-30):** parser só aceitava horário absoluto, e guarda anti-dup checava 7 dias por created_at sem filtro de status — bloqueava qualquer reminder novo se houvesse algum executado nos últimos 7 dias.
