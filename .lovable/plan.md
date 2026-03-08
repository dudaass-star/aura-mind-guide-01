# Cápsula do Tempo — Implementado ✅

## O que foi feito

1. **Tabela `time_capsules`** + colunas `awaiting_time_capsule` e `pending_capsule_audio_url` no `profiles`
2. **Intercepção no `webhook-zapi`**: antes do fluxo normal, detecta estado da cápsula e gerencia áudio/confirmação/cancelamento/regravação
3. **Tag `[CAPSULA_DO_TEMPO]` no `aura-agent`**: quando a Aura propõe e o usuário aceita, a tag ativa o modo de captura
4. **Instrução no prompt**: ~10 linhas ensinando a Aura quando/como propor a cápsula
5. **Edge function `deliver-time-capsule`**: cron diário (10h) que entrega cápsulas vencidas via WhatsApp
6. **Fluxo de confirmação**: o usuário pode regravar quantas vezes quiser antes de confirmar

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
