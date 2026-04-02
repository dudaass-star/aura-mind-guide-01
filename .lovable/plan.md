

## Correção: Newlines em ContentVariables Quebram Twilio Content API

### Causa Raiz Confirmada

Através de testes diretos, confirmei que:
- Texto simples sem `\n` → funciona
- Texto com emojis (💜, 🤍) → funciona
- Texto com URL → funciona
- Texto com `\n` (newlines) → **FALHA com erro 21656**

O Twilio Content API rejeita ContentVariables cujo valor contém caracteres de newline. Isso afeta **todas as mensagens proativas** que contêm quebras de linha — não apenas checkout_recovery.

### Impacto

Qualquer mensagem enviada via template (fora da janela de 24h) que contenha `\n` no texto está falhando silenciosamente. Isso inclui:
- Checkout recovery (confirmado falhando)
- Check-ins, insights, relatórios semanais, session reminders — todos potencialmente afetados quando contêm newlines

### Correção

Uma única mudança em `whatsapp-official.ts`, na função `sendTemplateMessage`: sanitizar os valores das variáveis antes de enviá-las, substituindo newlines por espaços.

**Arquivo**: `supabase/functions/_shared/whatsapp-official.ts`

Na função `sendTemplateMessage`, após construir `contentVars`, sanitizar:
```typescript
// Sanitize: Twilio Content API rejects newlines in ContentVariables
const sanitizedVars: Record<string, string> = {};
for (const [key, val] of Object.entries(contentVars)) {
  sanitizedVars[key] = val.replace(/\n+/g, ' ');
}
```

E usar `sanitizedVars` no `JSON.stringify` em vez de `contentVars`.

### Passo 2: Resetar checkouts falhados

Após o deploy, resetar os registros que falharam hoje para permitir reenvio:
- Executar migration para resetar `recovery_sent = false` e `recovery_attempts_count = 0` para os 4-5 checkouts que falharam em 02/04 com erro 21656

### Detalhes Técnicos

- **Arquivo alterado**: `supabase/functions/_shared/whatsapp-official.ts` — sanitização de newlines na função `sendTemplateMessage`
- **Migration**: Reset dos `checkout_sessions` falhados por 21656 em 02/04
- **Deploy**: `whatsapp-official.ts` é shared, então qualquer função que importe dele será automaticamente atualizada no próximo deploy. Vamos deployar `recover-abandoned-checkout` para validar.

