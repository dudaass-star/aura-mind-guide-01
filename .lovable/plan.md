

## Corrigir template dos lembretes de sessão

### Problema
A função `session-reminder` chama `sendProactive(cleanPhone, message)` sem passar o `templateCategory`, fazendo default para `'checkin'`. Quando o usuário está fora da janela de 24h da Meta, o lembrete é enviado pelo template errado (`checkin` em vez de `session_reminder`).

### Correção
**Arquivo:** `supabase/functions/session-reminder/index.ts`

Atualizar as 4 chamadas `sendProactive` para incluir a categoria correta e o userId:

| Linha | De | Para |
|-------|-----|------|
| 249 | `sendProactive(cleanPhone, message)` | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |
| 320 | `sendProactive(cleanPhone, message)` | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |
| 381 | `sendProactive(cleanPhone, message)` | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |
| 458 | `sendProactive(cleanPhone, message)` | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |

Isso garante que fora da janela de 24h, o template aprovado `aura_session_reminde` (ContentSid ativo) será usado em vez do template genérico de check-in.

### Impacto
- Nenhuma mudança de comportamento dentro da janela de 24h (continua texto livre)
- Fora da janela: usa o template correto de `session_reminder`
- O `userId` permite verificar a janela de 24h antes de decidir entre texto livre e template

