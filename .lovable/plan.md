

## Auditoria Completa — Fluxo de Trial R$1 + Cobrança Após 5 Dias

### Resultado: ✅ Tudo correto. Nenhum problema encontrado.

---

### FLUXO 1: Checkout de R$1

**Status: ✅ Correto**

- `create-checkout/index.ts` linha 157: `mode: "payment"`, `unit_amount: 100` (R$1)
- Linha 163: Nome dinâmico `AURA — Ativação do Plano ${planDisplayName}` (Essencial/Direção/Transformação)
- Linha 164: Descrição "Verificação de segurança. Valor estornado automaticamente."
- Linha 172: `setup_future_usage: 'off_session'` — salva cartão para cobranças futuras
- Linha 173: `request_three_d_secure: 'any'` — força 3DS
- Linha 182: `trial_validation: "true"` no metadata — identifica o fluxo no webhook

### FLUXO 2: Webhook processa trial validation

**Status: ✅ Correto**

- Linha 132: Detecta `trial_validation === 'true'` e `mode === 'payment'`
- Linha 155-159: Recupera PaymentIntent expandido com payment_method, verifica `card.funding`
- Linha 163-168: **Sempre estorna o R$1** — independente do tipo do cartão
- Linha 171: Se `cardFunding !== 'credit'` → rejeita, envia WhatsApp com link de retry
- Linha 239+: Se crédito → cria assinatura com trial

### FLUXO 3: Cenários de falha na validação

**Status: ✅ Correto**

| Cenário | O que acontece |
|---------|---------------|
| Cartão sem saldo | Stripe Checkout bloqueia. Nenhum webhook disparado. |
| Cartão débito/pré-pago | R$1 cobrado → estornado → WhatsApp de rejeição com retry link |
| 3DS falha | Stripe Checkout bloqueia. Nenhum webhook disparado. |

### FLUXO 4: Criação da assinatura trial

**Status: ✅ Correto**

- Linha 243-247: Busca payment methods do customer
- Linha 249-265: Fallback — se lista vazia, attach PM direto do PaymentIntent
- Linha 286-301: Cria subscription com:
  - `trial_period_days: 5`
  - `payment_behavior: 'allow_incomplete'` ✅ (corrigido na última alteração)
  - `default_payment_method` setado
- Linha 313-322: Seta `invoice_settings.default_payment_method` no customer (triple-link)
- Linha 329+: Cria/atualiza profile com `status: 'trial'`
- Linha 388+: Envia mensagem de boas-vindas via WhatsApp

### FLUXO 5: Cobrança após 5 dias

**Status: ✅ Correto**

Dois handlers capturam a conversão (redundância intencional):

1. **`customer.subscription.updated`** (linha 1076-1119): Detecta `trialing → active`, seta `status: 'active'`, `converted_at`, limpa `payment_failed_at`, cancela tasks de trial pendentes
2. **`invoice.paid`** (linha 844-896): Backup — se profile ainda em `trial` ou `trial_expired`, converte para `active`

### FLUXO 6: Falha no pagamento do dia 5

**Status: ✅ Correto**

- **`invoice.payment_failed`** (linha 898-1073):
  - Audit trail fail-safe: insere `dunning_attempts` com `error_stage: 'in_progress'` antes de qualquer ação
  - Seta `payment_failed_at` no profile
  - Gera link do Billing Portal + encurta via `create-short-link`
  - Envia WhatsApp empático com link para atualizar cartão
  - Atualiza audit trail com resultado final

### FLUXO 7: Cancelamento

**Status: ✅ Correto**

- `customer.subscription.deleted` (linha 672-751): Envia mensagem de despedida, atualiza profile para `status: 'canceled'`

### FLUXO 8: Reativação

**Status: ✅ Correto**

- `customer.subscription.resumed` (linha 754-841): Envia mensagem de boas-vindas, atualiza para `status: 'active'`, cancela tasks de trial pendentes

---

### Resumo

Todos os 8 fluxos estão corretamente implementados. A correção do `payment_behavior: 'allow_incomplete'` (feita anteriormente) garante que o dunning funcione corretamente após o trial. Nenhuma alteração necessária.

