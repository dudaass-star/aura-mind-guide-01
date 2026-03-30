

## Auditoria Completa do Fluxo de Trial R$1 + Cobrança Após 5 Dias

### Resumo: O fluxo está corretamente configurado. Apenas 1 problema encontrado.

---

### FLUXO 1: Cobrança de R$1 e Estorno

**Status: ✅ Correto**

1. `create-checkout/index.ts` cria sessão Stripe com `mode: "payment"`, `unit_amount: 100` (R$1), `setup_future_usage: 'off_session'`, `request_three_d_secure: 'any'`
2. Metadata inclui `trial_validation: "true"` — essencial para o webhook identificar o fluxo
3. Cartão é salvo para cobrança futura via `setup_future_usage`

### FLUXO 2: Webhook processa checkout.session.completed (trial)

**Status: ✅ Correto**

1. Detecta `trial_validation === 'true'` e `mode === 'payment'`
2. Recupera PaymentIntent e verifica `card.funding`
3. **Sempre estorna o R$1** (linha 163-168 do webhook) — independente do tipo do cartão
4. Se cartão **não é crédito**: rejeita, atualiza status para `rejected_card_type`, envia WhatsApp com link para tentar novamente
5. Se cartão **é crédito**: prossegue com criação da assinatura

### FLUXO 3: O que acontece se a validação falhar

**Status: ✅ Correto**

- **Cartão sem saldo**: O pagamento de R$1 falha no Stripe Checkout. O usuário vê erro na própria página do Stripe. Nenhum webhook é disparado.
- **Cartão de débito/pré-pago**: Pagamento passa, R$1 é estornado, mensagem de rejeição é enviada via WhatsApp com link de retry
- **3DS falha**: Stripe Checkout bloqueia o pagamento. Nenhum webhook é disparado.

### FLUXO 4: Criação da assinatura com trial de 5 dias

**Status: ✅ Correto**

1. Busca payment methods do customer
2. Cria assinatura com `trial_period_days: 5`, `payment_behavior: 'default_incomplete'`
3. Seta `default_payment_method` na subscription
4. Seta `invoice_settings.default_payment_method` no customer (para cobranças off-session)
5. Cria/atualiza profile com `status: 'trial'`
6. Envia mensagem de boas-vindas via WhatsApp

### FLUXO 5: Cobrança após 5 dias

**Status: ✅ Correto**

Quando o trial de 5 dias expira, o Stripe automaticamente gera uma invoice e tenta cobrar. Dois webhooks capturam a conversão:

- **`customer.subscription.updated`** (linhas 1076-1117): Detecta transição `trialing → active`, atualiza profile para `status: 'active'`, seta `converted_at`
- **`invoice.paid`** (linhas 844-896): Backup — se profile ainda está em `trial` ou `trial_expired`, converte para `active`

Se o pagamento falhar:
- **`invoice.payment_failed`**: Registra `payment_failed_at` no profile, cria audit trail em `dunning_attempts`, envia WhatsApp com link do Billing Portal

---

### ⚠️ 1 PROBLEMA ENCONTRADO

**`payment_behavior: 'default_incomplete'` pode causar problemas**

Na linha 290 do webhook, a assinatura é criada com `payment_behavior: 'default_incomplete'`. Este comportamento significa que se a primeira invoice requer pagamento (após o trial), ela ficará com status `incomplete` até ser confirmada explicitamente. No entanto, como a assinatura tem `trial_period_days: 5`, a primeira invoice durante o trial é de R$0 e funciona normalmente. O problema potencial é na transição: se houver qualquer issue com o PM no dia 5, a subscription pode ficar `incomplete` ao invés de `past_due`, o que muda o comportamento de retry do Stripe.

**Recomendação**: Trocar para `payment_behavior: 'default_incomplete'` → `payment_behavior: 'allow_incomplete'` para que a subscription continue ativa (em `past_due`) mesmo se a primeira cobrança real falhar, permitindo que o sistema de dunning funcione normalmente.

### Conclusão

O fluxo está **bem construído e seguro**. O único ajuste recomendado é o `payment_behavior` para garantir que falhas de pagamento no dia 5 sejam tratadas pelo dunning ao invés de travar a subscription como `incomplete`.

