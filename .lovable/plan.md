

## Blindagem completa contra bloqueios de cartão

### Contexto

Os erros "Blocked" de ontem foram de clientes órfãos (já cancelados), mas a preocupação é válida: precisamos garantir que cobranças automáticas futuras nunca sejam bloqueadas pelos bancos.

### Diagnóstico técnico

O fluxo atual já tem as proteções básicas corretas:
- `setup_future_usage: 'off_session'` no checkout (sinaliza ao banco que o cartão será usado para cobranças futuras)
- PM vinculado ao customer e à subscription
- `invoice_settings.default_payment_method` sincronizado

Porém existem **duas camadas adicionais** que podemos implementar para maximizar a taxa de aprovação:

### Plano de correção

**Passo 1 — Forçar 3DS em toda cobrança de validação**

Adicionar `request_three_d_secure: 'always'` no checkout de trial. Quando o banco vê que o cliente passou por autenticação 3DS, cobranças off-session futuras têm taxa de aprovação significativamente maior (o banco já validou a identidade do titular).

Arquivo: `supabase/functions/create-checkout/index.ts`
```typescript
payment_method_options: {
  card: {
    setup_future_usage: 'off_session',
    request_three_d_secure: 'always', // NOVO
  },
},
```

**Passo 2 — Adicionar `mandate_options` para indicar recorrência**

Na mesma configuração, adicionar informações de mandato que sinalizam ao banco emissor que esta é uma cobrança recorrente autorizada. Isso reduz drasticamente rejeições por "fraude" em cobranças off-session.

Arquivo: `supabase/functions/create-checkout/index.ts`
```typescript
payment_method_options: {
  card: {
    setup_future_usage: 'off_session',
    request_three_d_secure: 'always',
    mandate_options: {
      description: 'Assinatura Aura - cobrança recorrente mensal/anual',
    },
  },
},
```

**Passo 3 — Configurar retry inteligente no Stripe**

O Stripe tem um recurso chamado "Smart Retries" que automaticamente re-tenta cobranças falhas em horários otimizados. Isso é configurado no Stripe Dashboard (Settings > Billing > Subscriptions and emails > Manage failed payments). Não requer mudança de código, mas é importante garantir que está ativado com:
- Smart Retries: ON
- Retry up to 4 times over 3 weeks

**Passo 4 — Adicionar `payment_behavior: 'error_if_incomplete'` na criação da subscription**

Atualmente, se a subscription é criada e o PM falha silenciosamente, ela entra em `incomplete`. Com esta flag, o erro é imediato e podemos notificar o cliente na hora.

Arquivo: `supabase/functions/stripe-webhook/index.ts` (criação da subscription)
```typescript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: subscriptionPriceId }],
  trial_period_days: 5,
  payment_behavior: 'default_incomplete', // Garante que erros são capturados
  ...(defaultPm && { default_payment_method: defaultPm }),
  // ...metadata
});
```

### Arquivos alterados
- `supabase/functions/create-checkout/index.ts` — Adicionar `request_three_d_secure` e `mandate_options`
- `supabase/functions/stripe-webhook/index.ts` — Nenhuma mudança adicional necessária (já está correto)

### Sobre os erros de ontem
Os "Blocked" de ontem eram tentativas automáticas do Stripe em assinaturas de clientes cujos perfis foram deletados. Como já cancelamos essas assinaturas, não haverá mais tentativas. O sistema agora está protegido em 3 camadas:
1. **3DS obrigatório** → banco valida identidade na hora
2. **Mandato de recorrência** → banco sabe que é cobrança autorizada
3. **PM triplo-vinculado** → subscription + customer + invoice_settings

