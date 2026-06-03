---
name: Reescrita de reminder no dia de execução
description: execute-scheduled-tasks reescreve via Flash-Lite reminders com expressões relativas (amanhã/hoje/dia da semana) quando o reminder foi criado em outro dia BRT, evitando "amanhã às 11h" enviado hoje
type: feature
---
Quando um `scheduled_tasks.task_type='reminder'` (ou 'message') é executado, o texto do payload é avaliado:
1. Se contém expressão relativa de dia (amanhã, hoje, ontem, dia da semana) E foi criado em data BRT diferente de hoje, é reescrito por Gemini Flash-Lite usando HOJE como referência.
2. Fallback silencioso pro texto original se LLM falhar ou rewrite vier vazio/longo demais.

**Por quê:** sem isso, "Amanhã às 11h e sexta às 13h" gravado ontem é enviado hoje literalmente, fazendo o usuário pensar que a Aura se perdeu no calendário.

**Onde:** `supabase/functions/execute-scheduled-tasks/index.ts` → função `rewriteReminderForToday`.