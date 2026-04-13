

## Plano: Corrigir endpoint de resposta a comentários

### Problema
O reply a comentários falha com "Invalid OAuth access token" porque usa o endpoint errado:
- **Atual**: `https://graph.instagram.com/v21.0/${comment_id}/replies?access_token=...`
- **Correto**: `https://graph.facebook.com/v21.0/${comment_id}/replies?access_token=...`

O token armazenado no banco é um **Page Access Token** (obtido via Facebook OAuth), que funciona no `graph.facebook.com` (por isso DMs funcionam) mas não é reconhecido pelo `graph.instagram.com`.

### Mudança

**Arquivo**: `supabase/functions/instagram-agent/index.ts` (linha 183)

Trocar `graph.instagram.com` por `graph.facebook.com` no URL de reply a comentários:

```typescript
// De:
const replyUrl = `https://graph.instagram.com/v21.0/${interaction.comment_id}/replies?access_token=...`;

// Para:
const replyUrl = `https://graph.facebook.com/v21.0/${interaction.comment_id}/replies?access_token=...`;
```

Adicionar log de debug similar ao das DMs.

### Re-deploy
Deploy automático da função `instagram-agent`.

