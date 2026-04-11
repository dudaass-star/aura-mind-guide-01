

## Plano: Corrigir cancel-subscription para incluir assinaturas past_due

### Problema
A edge function `cancel-subscription` busca apenas subscriptions com `status: "active"`. Clientes com pagamento atrasado (`past_due`) ficam impossibilitados de cancelar pelo site.

### Solução
No arquivo `supabase/functions/cancel-subscription/index.ts`, alterar a busca de subscriptions para incluir também o status `past_due`. Isso permite que clientes com cobrança pendente possam cancelar ou pausar normalmente.

### Alteração

**Arquivo: `supabase/functions/cancel-subscription/index.ts`**

1. Primeira busca (linha ~87): trocar `status: "active"` por buscar tanto `active` quanto `past_due` — fazer duas chamadas ou remover o filtro de status e filtrar no código.

2. Abordagem mais simples: buscar subscriptions sem filtro de status restritivo e pegar a primeira que seja `active` ou `past_due`:

```typescript
// Buscar active primeiro
const activeSubs = await stripe.subscriptions.list({
  customer: customer.id,
  status: "active",
  limit: 1,
});

let subscription = activeSubs.data[0];

// Se não encontrou active, buscar past_due
if (!subscription) {
  const pastDueSubs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "past_due",
    limit: 1,
  });
  subscription = pastDueSubs.data[0];
}
```

3. O resto da lógica (check, pause, cancel) funciona igual para ambos os status.

### Resultado esperado
Clientes com assinatura `past_due` poderão cancelar ou pausar pelo site normalmente.

