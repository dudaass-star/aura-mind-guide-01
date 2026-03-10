

# Desativar follow-ups automáticos para usuários com sessão agendada nos proximos 7 dias

## Escopo

| Função | Ação |
|---|---|
| `pattern-analysis` (insights) | Manter como está |
| `conversation-followup` | Manter como está |
| `scheduled-followup` (compromissos) | Adicionar trava de sessão 7 dias |
| `scheduled-checkin` (check-in diário) | Adicionar trava de sessão 7 dias |

## Implementação

### 1. `scheduled-followup/index.ts`

Dentro do loop de commitments, após o check de DND (linha 64), adicionar consulta à tabela `sessions`:

```typescript
// Skip if user has a session scheduled in the next 7 days
const sevenDaysFromNow = new Date();
sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

const { data: upcomingSessions } = await supabase
  .from('sessions')
  .select('id')
  .eq('user_id', profile.user_id)
  .eq('status', 'scheduled')
  .gte('scheduled_at', new Date().toISOString())
  .lte('scheduled_at', sevenDaysFromNow.toISOString())
  .limit(1);

if (upcomingSessions && upcomingSessions.length > 0) {
  console.log(`📅 Skipping commitment ${commitment.id} - user has session in next 7 days`);
  continue;
}
```

### 2. `scheduled-checkin/index.ts`

Dentro do loop por profile (após linha 93, antes de buscar lastCheckin), adicionar a mesma verificação:

```typescript
const sevenDaysFromNow = new Date();
sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

const { data: upcomingSessions } = await supabase
  .from('sessions')
  .select('id')
  .eq('user_id', profile.user_id)
  .eq('status', 'scheduled')
  .gte('scheduled_at', new Date().toISOString())
  .lte('scheduled_at', sevenDaysFromNow.toISOString())
  .limit(1);

if (upcomingSessions && upcomingSessions.length > 0) {
  console.log(`📅 Skipping check-in for ${profile.name} - session scheduled in next 7 days`);
  continue;
}
```

## Arquivos afetados

- `supabase/functions/scheduled-followup/index.ts`
- `supabase/functions/scheduled-checkin/index.ts`

Sem alterações no banco de dados. A tabela `sessions` já tem a coluna `status` e `scheduled_at` necessárias.

