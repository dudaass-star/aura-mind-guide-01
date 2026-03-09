

# Plano: Adicionar check de `scheduled_tasks` pendentes no `reactivation-check`

## Problema

O `reactivation-check` envia mensagens de reengajamento para usuários inativos, mas não verifica se já existe um retorno combinado (tarefa agendada pendente). Isso pode causar mensagens redundantes — ex: a Aura combinou de mandar um lembrete amanhã, mas o reactivation-check manda uma mensagem de "sinto sua falta" antes disso.

## Alteração

Adicionar verificação de `scheduled_tasks` pendentes em **ambos os blocos** do `reactivation-check`:

### 1. Bloco de sessões perdidas (linha ~60, após check de `last_reactivation_sent`)
Antes de enviar mensagem de "senti sua falta na sessão", verificar se o usuário tem tasks pendentes. Se sim, skip — o sistema já vai entrar em contato.

### 2. Bloco de usuários inativos (linha ~154, após check de `upcomingSessions`)
Antes de enviar mensagem de reengajamento, verificar se há tasks pendentes. Se sim, skip — já há retorno combinado.

### Código a adicionar (mesmo padrão usado no `pattern-analysis`)

```typescript
// Check for pending scheduled tasks (return already planned)
const { data: pendingTasks } = await supabase
  .from('scheduled_tasks')
  .select('id')
  .eq('user_id', userId)
  .eq('status', 'pending')
  .limit(1);

if (pendingTasks && pendingTasks.length > 0) {
  logStep(`Skipping user ${userId} - has pending scheduled task`);
  continue;
}
```

## Arquivo afetado

- `supabase/functions/reactivation-check/index.ts` — 2 inserções de ~10 linhas cada

