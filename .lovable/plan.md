

# Fix: Aura interpreta mensagens acumuladas como "duplicadas"

## Diagnóstico real

O problema **não é duplicação real no banco**. O dedup está funcionando. O que acontece:

1. Eduardo manda 3 mensagens rápidas: "Ainda naooo", "Esse find", "Eu acho kkkk"
2. O debounce funciona corretamente — apenas 1 worker processa
3. A acumulação formata assim: `[Mensagens anteriores do usuário: Ainda naooo / Esse find]\n\nEu acho kkkk`
4. O modelo de IA vê esse formato e **interpreta como "resposta dupla"**, comentando: "essa resposta dupla..."

O problema é que o formato `[Mensagens anteriores do usuário: ...]` confunde o modelo. Ele acha que são mensagens repetidas em vez de mensagens sequenciais naturais (comportamento normal no WhatsApp).

## Correção (1 alteração)

### `supabase/functions/process-webhook-message/index.ts` (linhas 660-664)

Mudar o formato de acumulação para algo que o modelo entenda como mensagens sequenciais naturais, sem o rótulo que sugere duplicação:

**Antes:**
```typescript
messageText = `[Mensagens anteriores do usuário: ${previous}]\n\n${last}`;
```

**Depois:**
```typescript
// Concatenar como uma mensagem natural — o modelo não precisa saber que foram msgs separadas
messageText = recentUserMsgs.map(m => m.content).join('\n');
```

Isso junta as mensagens com quebra de linha simples, como se o usuário tivesse escrito tudo junto. O modelo não tem motivo para comentar sobre "duplicação" ou "resposta dupla".

## Arquivo editado
- `supabase/functions/process-webhook-message/index.ts` — formato de acumulação

## Resultado esperado
- Aura recebe "Ainda naooo\nEsse find\nEu acho kkkk" como texto único
- Nunca mais comenta sobre "mensagem dupla" ou "resposta dupla"
- Debounce continua funcionando normalmente

