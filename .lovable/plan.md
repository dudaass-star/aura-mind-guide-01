

## Diagnóstico: Cancelamento falha para Roberto (19) 99884-9238

**Problema**: A função `cancel-subscription` busca o cliente no Stripe com `metadata['phone']:'5519998849238'`, mas o telefone pode estar armazenado no Stripe em formato diferente (ex: `19998849238` sem o prefixo 55), pois a `create-checkout` armazena o telefone exatamente como o usuário digitou (apenas removendo caracteres não-numéricos).

**Causa raiz**: A `create-checkout` usa `getPhoneVariations()` para **buscar** clientes existentes, mas armazena o telefone como veio. Já a `cancel-subscription` faz uma busca simples com formato fixo (sempre adiciona "55"), sem usar `getPhoneVariations()`.

### Plano de correção

**Arquivo**: `supabase/functions/cancel-subscription/index.ts`

1. Importar `getPhoneVariations` de `../_shared/zapi-client.ts`
2. Substituir a busca simples por um loop que testa todas as variações do telefone (com e sem 55, com e sem nono dígito), igual ao padrão já usado em `create-checkout`

```text
Antes:
  customers = stripe.customers.search({ query: `metadata['phone']:'5519998849238'` })

Depois:
  for (phoneVar of getPhoneVariations(phone)) {
    customers = stripe.customers.search({ query: `metadata['phone']:'${phoneVar}'` })
    if found → break
  }
```

Isso garante que o cancelamento encontre o cliente independentemente do formato em que o telefone foi salvo no Stripe.

