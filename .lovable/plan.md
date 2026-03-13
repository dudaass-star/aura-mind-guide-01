

# Correção do Reengajamento — Plano

## O problema

Hoje o bloco de reengajamento no `conversation-followup` verifica apenas:
- DND ativo
- Sessão em andamento (`current_session_id`)
- Última mensagem há mais de 7 dias
- Último follow-up há mais de 7 dias

**Faltam duas verificações cruciais:**
1. **Sessão futura agendada** — se o usuário marcou sessão para daqui 5 dias, a Aura não precisa "puxar" ele de volta
2. **Tarefas/reflexões pendentes** — se a Aura deixou tarefas ou compromissos para o usuário, ele está "acompanhado" e não precisa de reengajamento

Sem isso, um usuário que marcou sessão para a semana seguinte e recebeu uma reflexão pode receber uma mensagem tipo "faz tempo que não nos falamos", o que soa desconectado.

## O que muda na prática

A Aura só vai mandar mensagem de reengajamento se o usuário:
- Está inativo há 7+ dias **E**
- Não tem nenhuma sessão agendada no futuro **E**
- Não tem compromissos pendentes (tarefas/reflexões que a Aura deixou) **E**
- Não tem tarefas agendadas pendentes em `scheduled_tasks`

Se qualquer uma dessas condições for verdadeira, o reengajamento é pulado — o usuário já está "acompanhado".

## Mudança técnica

**Arquivo:** `supabase/functions/conversation-followup/index.ts`

**Onde:** No bloco de reengajamento (~linha 640, após o check de `current_session_id`), adicionar 3 queries:

1. Verificar sessões futuras agendadas (`sessions` com `status = 'scheduled'` e `scheduled_at > now`)
2. Verificar compromissos pendentes (`commitments` com `completed = false`)
3. Verificar tarefas pendentes (`scheduled_tasks` com `status = 'pending'`)

Se qualquer uma retornar resultados, pular o reengajamento com log explicativo.

Também corrigir o bug do `last_followup_at` (campo compartilhado entre follow-up regular e reengajamento):
- Migração SQL: adicionar coluna `last_reengagement_at` na tabela `conversation_followups`
- Usar `last_reengagement_at` no controle de frequência do reengajamento (~linhas 661-672)
- Atualizar `last_reengagement_at` após envio bem-sucedido

## Arquivos alterados
- **Migração SQL**: `ALTER TABLE conversation_followups ADD COLUMN last_reengagement_at timestamptz DEFAULT NULL`
- **`supabase/functions/conversation-followup/index.ts`**: adicionar guards + separar campo de frequência

