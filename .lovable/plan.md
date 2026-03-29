

## Prevenir bloqueios de cartão no vencimento do trial

### Diagnóstico

Analisei o fluxo completo de pagamento. Os erros "Blocked" dos screenshots de ontem eram de usuários órfãos (já resolvidos com cancelamento). Porém, existem vulnerabilidades no código atual que podem causar falhas de cobrança futuras:

**Problema 1**: Quando o trial subscription é criado (linha 270 do webhook), o `default_payment_method` é definido na assinatura mas **NÃO** no `invoice_settings` do customer. Isso pode causar falha quando o Stripe tenta cobrar automaticamente.

**Problema 2**: Após a cobrança de R$1 e refund, se o PM não estiver como `invoice_settings.default_payment_method`, o Stripe pode não encontrar um método de pagamento válido para cobranças off-session.

**Problema 3**: Não há validação de que o PM foi efetivamente salvo antes de criar a assinatura.

### Plano de correção

**Passo 1 — Corrigir `stripe-webhook/index.ts` (checkout.session.completed, trial flow)**

Após criar a subscription com `default_payment_method`, também atualizar o customer:

```typescript
// Após linha 284 (subscription created)
if (defaultPm) {
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: defaultPm },
  });
  console.log('✅ Customer invoice_settings updated with default PM');
}
```

**Passo 2 — Adicionar fallback robusto para PM não encontrado**

Atualmente, se `paymentMethods.data[0]` retorna vazio, o código apenas loga erro mas continua criando a subscription sem PM. Devemos buscar o PM do PaymentIntent diretamente:

```typescript
let defaultPm = paymentMethods.data[0]?.id;
if (!defaultPm && paymentMethod?.id) {
  // Attach from the PaymentIntent's payment method
  try {
    await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });
    defaultPm = paymentMethod.id;
    console.log('✅ PM attached from PaymentIntent:', defaultPm);
  } catch (attachErr) {
    console.error('❌ Failed to attach PM:', attachErr);
  }
}
```

**Passo 3 — Verificação pós-criação da subscription**

Após criar a subscription, verificar se o PM está corretamente vinculado e, se não, corrigir imediatamente:

```typescript
if (defaultPm && !subscription.default_payment_method) {
  await stripe.subscriptions.update(subscription.id, {
    default_payment_method: defaultPm,
  });
}
```

### Arquivos alterados

- `supabase/functions/stripe-webhook/index.ts` — Seção `checkout.session.completed` (trial validation flow), linhas ~240-285

### Impacto

Estas correções garantem que todo novo trial terá o método de pagamento corretamente vinculado tanto na subscription quanto no customer, eliminando a causa raiz de falhas de cobrança automática no vencimento do trial.

