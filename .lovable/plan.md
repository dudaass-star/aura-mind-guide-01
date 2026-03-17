

## Causa raiz

A correção anterior adicionou persistência imediata do inbound no `webhook-zapi` (linha 394-401), mas o `aura-agent` (linha 5632-5636) **também insere a mensagem do usuário** ao final do processamento. Resultado: toda mensagem do fluxo normal é salva duas vezes.

A flag `inboundSaved` só protege contra duplicatas **dentro** do webhook-zapi. Ela não é passada para o aura-agent.

## Correção

**Arquivo:** `supabase/functions/aura-agent/index.ts` (linha 5631-5636)

Remover o insert da mensagem do usuário no aura-agent. O webhook-zapi agora é o responsável único por persistir o inbound. O aura-agent continua salvando apenas a resposta da assistente (linhas 5641-5645).

Ou seja, trocar:

```typescript
if (profile?.user_id) {
  await supabase.from('messages').insert({
    user_id: profile.user_id,
    role: 'user',
    content: message
  });
  // ... assistant insert stays
}
```

Por:

```typescript
if (profile?.user_id) {
  // User message already persisted by webhook-zapi
  // ... assistant insert stays
}
```

**Deploy:** `aura-agent`

### Limpeza das duplicatas existentes

Executar migração SQL para deletar mensagens duplicadas de `role = 'user'` com mesmo `user_id`, `content` e `created_at` dentro de 5 segundos de diferença, mantendo a mais antiga.

