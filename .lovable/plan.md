

# Fix: Mensagens em sequência — race condition no lock + persistência duplicada

## Problema

Quando o usuário manda 2+ mensagens rápidas, Worker 2 faz `upsert` na linha 336 e sobrescreve `last_user_message_id`. Worker 1 (que tem o lock) detecta o ID diferente no loop de envio (linha 736) e para — achando que foi interrompido. Worker 2 já abortou porque não conseguiu o lock. Resultado: Aura envia 1 balão e para.

Adicionalmente, o `aura-agent` salva a resposta completa no banco (linha 5610) E o `process-webhook-message` salva cada balão individualmente (linha 817) — duplicando mensagens no histórico.

## Correções

### 1. `process-webhook-message/index.ts` — Upsert sem sobrescrever o message ID

**Linha 336**: Trocar o upsert para usar `ignoreDuplicates: true` e remover `last_user_message_id` do payload. O ID só deve ser setado pelo worker que ganhar o lock (linha 350).

```typescript
// ANTES (linha 336):
.upsert({ user_id: profile.user_id, last_user_message_id: currentMessageId, updated_at: ... }, { onConflict: 'user_id' })

// DEPOIS:
.upsert({ user_id: profile.user_id, updated_at: ... }, { onConflict: 'user_id', ignoreDuplicates: true })
```

### 2. `aura-agent/index.ts` — Remover persistência duplicada

**Linhas 5604-5614**: Remover o bloco que salva a mensagem do assistant no banco. A persistência agora é feita exclusivamente pelo `process-webhook-message` (linha 817), que salva cada balão conforme é enviado com sucesso.

### 3. `process-webhook-message/index.ts` — Limpar `pending_content` após envio bem-sucedido

**Linhas 840-844**: No bloco de finalização sem interrupção, garantir que `pending_content` e `pending_context` sejam limpos explicitamente.

## Resultado esperado
- Worker que não ganha o lock **não** altera `last_user_message_id`
- Worker ativo envia **todos** os balões sem falsa interrupção
- Histórico sem mensagens duplicadas
- Mensagens sequenciais continuam sendo acumuladas e respondidas de uma vez

## Arquivos editados
- `supabase/functions/process-webhook-message/index.ts` (2 alterações)
- `supabase/functions/aura-agent/index.ts` (1 remoção)

