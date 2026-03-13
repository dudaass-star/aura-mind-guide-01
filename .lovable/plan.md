# Correções de Risco Médio — Implementadas ✅

## Resultado da Investigação

### 1. Índice UNIQUE em `user_insights` ✅ Já existia
### 2. Guard de phone vazio no `session-reminder` ✅ Já existia
### 3. Reengajamento no `conversation-followup` ✅ Corrigido

## O que foi corrigido no reengajamento

### Migração SQL ✅
Adicionada coluna `last_reengagement_at` na tabela `conversation_followups` para separar controle de frequência do reengajamento vs follow-ups regulares.

### Guards adicionados no bloco de reengajamento ✅
Antes de enviar reengajamento, agora verifica:
1. **Sessões futuras agendadas** — se tem sessão `scheduled` com `scheduled_at > now`, pula
2. **Compromissos pendentes** — se tem `commitments` com `completed = false`, pula
3. **Tarefas agendadas pendentes** — se tem `scheduled_tasks` com `status = 'pending'`, pula

### Campo de frequência separado ✅
- Controle de frequência agora usa `last_reengagement_at` em vez de `last_followup_at`
- Após envio, atualiza `last_reengagement_at` no upsert
