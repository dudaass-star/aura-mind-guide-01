

# Correção do Debounce e `|||` no Histórico — Plano Revisado

## 4 Correções

### 1. Strip `|||` antes de salvar no banco — `aura-agent/index.ts`
Na geração do `cleanAssistantMessage`, adicionar `.replace(/\|\|\|/g, '\n')` antes de salvar na tabela `messages`.

### 2. Debounce por query em `messages` — `process-webhook-message/index.ts`

**Pré-requisito**: capturar o `id` da mensagem inserida (linha 284 atual não faz `.select('id')`):
```typescript
const { data: insertedMsg } = await supabase
  .from('messages')
  .insert({ user_id: profile.user_id, role: 'user', content: messageText })
  .select('id')
  .single();
const inboundMessageDbId = insertedMsg?.id;
```

Substituir o debounce check (linhas 535-547) por:
```typescript
const { data: latestUserMsg } = await supabase
  .from('messages')
  .select('id')
  .eq('user_id', profile.user_id)
  .eq('role', 'user')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (latestUserMsg && latestUserMsg.id !== inboundMessageDbId) {
  // Mensagem mais recente existe — abortar
  return;
}
```

Manter o upsert em `aura_response_state` (linha 326) para o sistema de interrupção — ele serve outro propósito (sinalizar `is_responding`).

### 3. Acúmulo de mensagens sequenciais — com contexto separado

Quando o worker sobrevive ao debounce, buscar mensagens do usuário desde a última resposta do assistant e formatar com destaque na última:

```typescript
// Buscar última msg do assistant
const { data: lastAssistant } = await supabase
  .from('messages')
  .select('created_at')
  .eq('user_id', profile.user_id)
  .eq('role', 'assistant')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

// Buscar todas as msgs do user desde então
const query = supabase
  .from('messages')
  .select('content')
  .eq('user_id', profile.user_id)
  .eq('role', 'user')
  .order('created_at', { ascending: true });

if (lastAssistant) {
  query.gt('created_at', lastAssistant.created_at);
}

const { data: recentUserMsgs } = await query;

if (recentUserMsgs && recentUserMsgs.length > 1) {
  const previous = recentUserMsgs.slice(0, -1).map(m => m.content).join(' / ');
  const last = recentUserMsgs[recentUserMsgs.length - 1].content;
  messageText = `[Mensagens anteriores do usuário: ${previous}]\n\n${last}`;
}
```

Isso evita confusão do modelo — a Aura sabe que as anteriores são contexto e foca na última.

### 4. Safety net para `|||` no envio — `process-webhook-message/index.ts`
Antes de enviar cada mensagem ao WhatsApp, strip `|||`:
```typescript
responseText = responseText.replace(/\|\|\|/g, '').trim();
```

## Arquivos alterados
- `supabase/functions/aura-agent/index.ts` — strip `|||` antes de salvar
- `supabase/functions/process-webhook-message/index.ts` — capturar ID do insert, debounce por `messages`, acúmulo contextualizado, safety net `|||`

