

## Plano: Remover auto-silence para usuários ativos com pagamento em dia

### Problema
O check de auto-silence (7 dias sem mensagem) no `periodic-content` bloqueia **todos** os usuários, incluindo assinantes ativos com pagamento em dia. Usuários pagantes devem sempre receber o conteúdo das jornadas, independentemente de quanto tempo faz que mandaram mensagem.

### Correção

#### `supabase/functions/periodic-content/index.ts` (linhas 133-138)
Remover completamente o check de auto-silence de 7 dias. Usuários com status `active` ou `trial` (já filtrados na query) e com `current_journey_id` definido devem sempre receber episódios.

**Antes:**
```typescript
// Auto-silence: skip if user hasn't messaged in 7+ days
const lastMsg = user.last_message_date ? new Date(user.last_message_date) : null;
if (lastMsg && (Date.now() - lastMsg.getTime()) > 7 * 24 * 60 * 60 * 1000) {
  console.log(`🔇 Auto-silenced: ${user.name || 'Unknown'} (7+ days inactive)`);
  continue;
}
```

**Depois:** Bloco removido. O filtro de `do_not_disturb_until` permanece — é o único mecanismo para pausar conteúdo (quando o próprio usuário pede).

### Justificativa
- A query já filtra por `status IN ('active', 'trial')` — são usuários pagantes
- O auto-silence faz sentido para follow-ups conversacionais, mas **não** para conteúdo de jornada que é passivo
- O `do_not_disturb_until` continua como válvula de escape se o usuário pedir para pausar

### Arquivo modificado
- `supabase/functions/periodic-content/index.ts` — remover linhas 133-138

