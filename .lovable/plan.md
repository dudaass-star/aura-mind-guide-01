

## Problema: Nilda não recebeu mensagem da AURA

### Causa raiz

O telefone da Nilda está armazenado como `51981519712` (sem o código do país `55`). O `stripe-webhook` envia a mensagem de boas-vindas usando esse número exatamente como está nos metadados, sem adicionar o prefixo `55`.

A Z-API precisa do número no formato internacional completo: `5551981519712`.

Compare com o `start-trial/index.ts`, que corretamente adiciona o prefixo:
```typescript
const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : ...
```

O `stripe-webhook` **não faz essa normalização**.

### Correção

No `supabase/functions/stripe-webhook/index.ts`, após limpar o telefone (linha ~102), adicionar normalização do formato:

```typescript
const cleanPhone = customerPhone.replace(/\D/g, '');

// Adicionar código do país se necessário
const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11) 
  ? `55${cleanPhone}` 
  : cleanPhone;
```

Usar `formattedPhone` em vez de `cleanPhone`/`customerPhone` em todos os lugares:
1. No envio da mensagem via `send-zapi-message` (linha 177)
2. Na busca de perfil existente (linha 109)
3. No insert/update do perfil (linhas 206 e 236)

### Ação imediata para a Nilda

Após o deploy da correção, disparar manualmente a mensagem de boas-vindas para ela, ou corrigir o telefone no banco para `5551981519712` e reenviar o evento.

Alternativamente, posso atualizar o telefone dela no banco agora e enviar a mensagem via a Edge Function `admin-send-message`.

