

# Fix: Lock Atômico Anti-Duplicação com Finally Resiliente

## Arquivo: `supabase/functions/process-webhook-message/index.ts`

### Mudança 1 — Linhas 343-346: Abort se já respondendo (em vez de esperar 2s)

Substituir o bloco atual:
```
if (responseState?.is_responding) {
  console.log('⏸️ AURA está respondendo...');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

Por um check atômico que **aborta** se o lock está ativo há menos de 60s, ou limpa lock stale se > 60s.

### Mudança 2 — Linhas 660-667: Mover lock para ANTES do agent call (~linha 596)

O `is_responding = true` hoje é setado na linha 660, **depois** do agent call. Mover para antes da linha 600 (antes do fetch ao `aura-agent`), para que o lock esteja ativo quando um worker concorrente chegar.

### Mudança 3 — Linhas 596-778: Envolver em try/finally com cleanup resiliente

Envolver todo o bloco desde o set do lock até a finalização num `try { ... } finally { ... }`, onde o finally tem try/catch interno:

```typescript
// Set lock
await supabase.from('aura_response_state').update({
  is_responding: true,
  response_started_at: new Date().toISOString(),
  last_user_message_id: currentMessageId
}).eq('user_id', profile.user_id);

try {
  // ... agent call (linha 600-611)
  // ... conversation tracking (630-655)
  // ... send loop (669-754)
  // ... finalization com pending_content (759-778)
} finally {
  try {
    await supabase
      .from('aura_response_state')
      .update({ is_responding: false })
      .eq('user_id', profile.user_id)
      .eq('is_responding', true);
  } catch (cleanupError) {
    console.error(`⚠️ Erro silencioso ao liberar lock para user ${profile.user_id}:`, cleanupError);
  }
}
```

O `.eq('is_responding', true)` garante que o finally não sobrescreve o estado se a finalização normal (linhas 759-778) já salvou `pending_content` e setou `false`.

### Mudança 4 — Linhas 759-778: Manter como está

A finalização normal (que salva `pending_content` quando interrompido) continua igual. O finally é só safety net — se a finalização rodou, o `.eq('is_responding', true)` no finally não faz nada.

## Resumo

| O que muda | Antes | Depois |
|---|---|---|
| Worker concorrente (L343) | Espera 2s e continua | Aborta se lock < 60s |
| Lock `is_responding` (L660) | Setado depois do agent call | Setado antes |
| Proteção de erro | Nenhuma | try/finally com cleanup resiliente |
| Cleanup no finally | N/A | try/catch interno para não mascarar erro original |

**1 arquivo, ~25 linhas alteradas.**

