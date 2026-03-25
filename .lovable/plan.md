

# Dunning via WhatsApp quando pagamento falhar

## O que será feito

Quando o Stripe disparar `invoice.payment_failed`, além de registrar `payment_failed_at` (que já acontece), enviar uma mensagem WhatsApp ao usuário com opções para atualizar o cartão ou cancelar.

## Alterações

### 1. `supabase/functions/stripe-webhook/index.ts`

**No handler `invoice.payment_failed` (linhas 555-588):**
- Após registrar `payment_failed_at`, buscar o `user_id` e `name` do profile
- Criar um link de checkout via Stripe Customer Portal (billing portal session) para o usuário atualizar o cartão
- Gerar short link via `create-short-link`
- Enviar mensagem WhatsApp com tom empático:
  > "Oi, [nome]! Não conseguimos processar seu pagamento. Você pode atualizar seu cartão aqui: [link]. Se preferir cancelar, é só me avisar. 💜"
- Incluir `user_id` no envio para persistir no histórico de mensagens

**Fix no handler `customer.subscription.deleted` (linha 385):**
- O `cleanPhone` remove todos os não-dígitos mas o banco armazena com prefixo `55`. Adicionar a mesma lógica de formatação usada no checkout (linhas 120-122) para garantir match correto.

### 2. Stripe Billing Portal

- Usar `stripe.billingPortal.sessions.create()` para gerar um link temporário onde o usuário pode atualizar o método de pagamento
- Encurtar via `create-short-link` para ficar amigável no WhatsApp

### Fluxo resultante

```text
Stripe: invoice.payment_failed
  → Webhook registra payment_failed_at ✓ (já existe)
  → Webhook gera link do Billing Portal
  → Webhook encurta link via create-short-link
  → Webhook envia WhatsApp: "não conseguimos cobrar, atualize aqui: [link]"
  → Usuário clica → atualiza cartão OU responde "quero cancelar"

Stripe: customer.subscription.deleted (após todas tentativas)
  → Webhook marca status = 'canceled' + envia despedida (já existe, com fix no phone)
```

### Detalhes técnicos

- Usar `stripe.billingPortal.sessions.create({ customer: customerId, return_url: 'https://olaaura.com.br' })` para gerar o link
- O Billing Portal precisa estar configurado no Stripe Dashboard (já é habilitado por padrão)
- A mensagem será enviada via `send-zapi-message` com `user_id` para persistência

