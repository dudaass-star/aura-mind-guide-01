# Cápsula do Tempo — Implementado ✅

## O que foi feito

1. **Tabela `time_capsules`** + colunas `awaiting_time_capsule` e `pending_capsule_audio_url` no `profiles`
2. **Intercepção no `webhook-zapi`**: antes do fluxo normal, detecta estado da cápsula e gerencia áudio/confirmação/cancelamento/regravação
3. **Tag `[CAPSULA_DO_TEMPO]` no `aura-agent`**: quando a Aura propõe e o usuário aceita, a tag ativa o modo de captura
4. **Instrução no prompt**: ~10 linhas ensinando a Aura quando/como propor a cápsula
5. **Edge function `deliver-time-capsule`**: cron diário (10h) que entrega cápsulas vencidas via WhatsApp
6. **Fluxo de confirmação**: o usuário pode regravar quantas vezes quiser antes de confirmar

---

# Fix Schedule Setup Reminder (mensagens às 3h da manhã) — Implementado ✅

## Problema
A função `schedule-setup-reminder` rodava `0 */6 * * *` UTC (21h, 03h, 09h, 15h BRT), sem trava de horário silencioso, sem deduplicação e sem logging em `messages`.

## O que foi feito

1. **Quiet hours**: guardrail no código — skip se BRT < 8h ou >= 22h
2. **Cron ajustado**: de `0 */6 * * *` para `0 13 * * *` (10h BRT, 1x/dia)
3. **Deduplicação por estágio**: colunas `schedule_reminder_first_sent_at` e `schedule_reminder_urgent_sent_at` em `profiles` — cada lembrete enviado no máximo 1x por ciclo
4. **Safety filters**: skip se DND ativo, sessão ativa, interação recente (<2h), ou tarefa pendente
5. **Observabilidade**: mensagens enviadas agora são logadas na tabela `messages`
6. **Reset mensal**: `monthly-schedule-renewal` reseta os marcadores de dedup no início de cada mês

---

# Sistema de Agendamento de Tarefas (Efeito Oráculo) — Implementado ✅

## O que foi feito

1. **Tabela `scheduled_tasks`**: id, user_id, execute_at, task_type, payload (JSONB), status, created_at, executed_at
2. **Índice parcial**: `idx_scheduled_tasks_pending` em `execute_at WHERE status = 'pending'` — busca em milissegundos
3. **Função RPC `claim_pending_tasks`**: `FOR UPDATE SKIP LOCKED` com limite de 150 — atomicidade absoluta contra duplicidade
4. **RLS**: service_role full access + users can view own
5. **Tags no prompt do `aura-agent`**:
   - `[AGENDAR_TAREFA:YYYY-MM-DD HH:mm:tipo:descricao]` — agendar lembretes e meditações
   - `[CANCELAR_TAREFA:tipo]` — cancela o PRÓXIMO pendente (ORDER BY execute_at ASC)
6. **Processamento no `aura-agent`**: detecta as tags, cria/cancela tasks no banco, remove tags antes de mostrar ao usuário
7. **Sanitização no `webhook-zapi`**: remove tags de agendamento que vazem na resposta
8. **Edge function `execute-scheduled-tasks`**: processa tasks claimed, com delay 300ms anti-burst, handlers por tipo (reminder, meditation, message)
9. **Safety net**: tasks em `executing` há >10 min são resetadas para `pending`
10. **Cron `pg_cron`**: `*/5 * * * *` (cada 5 minutos) invocando a edge function

## Tipos de tarefa suportados

| Tipo | Payload | Ação |
|------|---------|------|
| `reminder` | `{ "text": "mensagem" }` | Envia texto via WhatsApp |
| `meditation` | `{ "category": "sono" }` | Invoca `send-meditation` |
| `message` | `{ "text": "mensagem" }` | Envia texto customizado |

## Fluxo completo

1. Usuário pede lembrete → Aura inclui `[AGENDAR_TAREFA:...]` na resposta
2. `aura-agent` detecta a tag → insere na tabela `scheduled_tasks` com payload padronizado
3. Tag é removida antes de o usuário ver a mensagem
4. A cada 5 min, `pg_cron` invoca `execute-scheduled-tasks`
5. Edge function chama `claim_pending_tasks(150)` (atômico, skip locked)
6. Processa cada task com 300ms de delay → envia via Z-API
7. Marca como `executed` ou `failed`

---

# Seletor de Modelo AI no Admin — Implementado ✅

## O que foi feito

1. **Tabela `system_config`**: key/value JSONB com RLS (admin + service_role)
2. **Página `AdminSettings.tsx`**: rota `/admin/configuracoes` com dropdown dos 4 modelos
3. **Função `callAI()`** no `aura-agent`: roteamento unificado Gateway vs Anthropic API
4. **Adaptador Anthropic**: system prompt separado, merge de mensagens consecutivas, max_tokens obrigatório
5. **Chamada principal** usa modelo configurado no banco; chamadas auxiliares (summary, onboarding, topic) usam `google/gemini-2.5-flash`
6. **Secret `ANTHROPIC_API_KEY`** configurado

## Modelos disponíveis

| Modelo | Via | Uso |
|---|---|---|
| `google/gemini-2.5-pro` (default) | Lovable AI Gateway | Chat principal |
| `google/gemini-2.5-flash` | Lovable AI Gateway | Auxiliares + opção principal |
| `anthropic/claude-sonnet-4-6` | API Anthropic direta | Chat principal |
| `openai/gpt-5` | Lovable AI Gateway | Chat principal |

---

# Insights Proativos 2x/semana + Remoção Check-in Segunda — Implementado ✅

## O que foi feito

1. **Cron `pattern-analysis` atualizado**: de `0 14 * * 4` (quinta) para `0 14 * * 4,6` (quinta + sábado, 11h BRT)
2. **Filtros de proteção adicionados** no `pattern-analysis/index.ts`:
   - Sessão ativa (`current_session_id`) → skip
   - Qualquer mensagem (user ou assistant) nas últimas 2h → skip
   - `scheduled_tasks` pendente (retorno já combinado) → skip
3. **Check-in de segunda desativado**: cron `weekly-checkin-monday-8am` removido, entrada removida do `config.toml`
4. **Limite de 1 insight/7 dias por usuário** mantido via `last_proactive_insight_at`

## Cronograma atualizado

| Dia | Sistema | Função |
|-----|---------|--------|
| Quinta 11h BRT | Insight proativo | `pattern-analysis` |
| Sábado 11h BRT | Insight proativo (2ª chance) | `pattern-analysis` |
| ~~Segunda 08h~~ | ~~Check-in semanal~~ | ~~Removido~~ |

---

# Auditoria Quiet Hours (8h-22h BRT) em todas as Edge Functions — Implementado ✅

## O que foi feito

Guardrail de quiet hours (8h-22h BRT) adicionado em **7 edge functions** que enviavam mensagens sem restrição de horário:

| Function | Tipo de guardrail |
|---|---|
| `periodic-content` | Skip total em quiet hours |
| `weekly-report` | Skip total (defensivo) |
| `scheduled-followup` | Skip total em quiet hours |
| `scheduled-checkin` | Skip total em quiet hours |
| `reactivation-check` | Skip total em quiet hours |
| `deliver-time-capsule` | Skip total (entrega na próxima execução diurna) |
| `session-reminder` | **Seletivo**: blocos 24h, post-sessão, missed e abandoned skipados; 1h, 15m, start e 10m continuam 24/7 (time-sensitive) |

## Functions já seguras (não alteradas)

| Function | Motivo |
|---|---|
| `conversation-followup` | Já tinha quiet hours |
| `pattern-analysis` | Já tinha quiet hours |
| `schedule-setup-reminder` | Corrigido na rodada anterior |
| `send-meditation` | Sob demanda (via aura-agent) |
| `cleanup-inactive-users` | Não envia mensagens |
