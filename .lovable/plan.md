
## Adicionar Campo de Email no Checkout

### Por que é importante?

1. **Stripe** - O email é o identificador principal de clientes no Stripe. Hoje criamos clientes sem email, o que dificulta buscas e comunicação
2. **Recibos automáticos** - O Stripe pode enviar recibos automaticamente por email
3. **Comunicação** - Newsletters, atualizações importantes, relatórios mensais
4. **Recuperação** - Caso o usuário perca acesso ao WhatsApp
5. **Profissionalismo** - Todo serviço de assinatura pede email

### Alterações Necessárias

#### 1. Banco de Dados
Adicionar coluna `email` na tabela `profiles`:

```sql
ALTER TABLE profiles ADD COLUMN email TEXT;
```

#### 2. Página de Checkout (Frontend)
Adicionar campo de email no formulário:
- Novo state `email`
- Input de email com validação
- Enviar email para a edge function

#### 3. Edge Function create-checkout
- Receber `email` no request
- Validar formato do email
- Incluir email ao criar cliente no Stripe (`email: email`)
- Incluir email nos metadados

#### 4. Edge Function stripe-webhook
- Capturar email do session/customer
- Salvar email no profile quando criar/atualizar

### Resumo Visual das Mudanças

```text
+-------------------+     +------------------+     +----------------+
|    Checkout.tsx   | --> | create-checkout  | --> |     Stripe     |
|  + campo email    |     |  + param email   |     | customer.email |
+-------------------+     +------------------+     +----------------+
                                  |
                                  v
                          +------------------+
                          | stripe-webhook   |
                          | salva no profile |
                          +------------------+
                                  |
                                  v
                          +------------------+
                          |     profiles     |
                          |  + coluna email  |
                          +------------------+
```

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `profiles` (banco) | Adicionar coluna `email TEXT` |
| `src/pages/Checkout.tsx` | Adicionar campo de email no formulário |
| `supabase/functions/create-checkout/index.ts` | Receber e validar email, passar para Stripe |
| `supabase/functions/stripe-webhook/index.ts` | Salvar email no profile |

### Detalhes Técnicos

**Validação de Email (Frontend)**:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  toast.error("Por favor, insira um email válido");
  return;
}
```

**Stripe Customer Creation**:
```typescript
const newCustomer = await stripe.customers.create({
  name: name,
  email: email,  // Novo!
  metadata: {
    phone: phoneClean,
  },
});
```

**Profile Insert/Update**:
```typescript
// No stripe-webhook
const customerEmail = session.customer_details?.email || session.metadata?.email;

await supabase.from('profiles').upsert({
  // ...outros campos
  email: customerEmail,
});
```

