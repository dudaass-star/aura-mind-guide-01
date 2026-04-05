

## Plano: Corrigir envio de e-mails de Checkout Abandonado e Dunning

### Problemas identificados

**1. Dunning: `no_subscription_on_invoice` (100% de falhas)**
Todas as tentativas recentes de dunning falham porque `invoice.subscription` vem como `undefined` no evento do webhook, mesmo que a invoice tenha `billing_reason: subscription_cycle` e o customer tenha uma subscription `past_due`. Isso acontece provavelmente por diferença entre a versão da API do webhook (configurada no dashboard do Stripe) e a versão usada no SDK (`2023-10-16`). O código atual simplesmente ignora a invoice se `invoice.subscription` for falsy.

**2. Checkout Recovery: `FunctionsHttpError` e sessões não retentadas**
- O erro antigo (401) foi corrigido com `supabase.functions.invoke()`, mas a tentativa mais recente (14:10 de hoje) retornou `FunctionsHttpError` — provavelmente o `send-transactional-email` retornou um erro HTTP que o `.invoke()` classifica como `FunctionsHttpError`.
- Todas as sessões que falharam com 401 foram marcadas como `recovery_sent = true`, então não serão retentadas automaticamente.

---

### Correções

#### 1. Stripe Webhook — resolver `subscription` quando vier null

No `stripe-webhook/index.ts`, dentro do bloco `invoice.payment_failed`:

- Quando `invoice.subscription` for null/undefined mas `billing_reason` indicar que é uma invoice de subscription (`subscription_cycle`, `subscription_update`, `subscription_create`):
  - Buscar o subscription via `stripe.subscriptions.list({ customer: customerId, status: 'past_due', limit: 1 })` ou `status: 'active'`
  - Se encontrar, usar esse subscription ID e continuar o fluxo normalmente
  - Isso desbloqueia **todos** os dunning events que estão falhando atualmente

#### 2. Checkout Recovery — melhorar tratamento de erros

No `recover-abandoned-checkout/index.ts`:

- Após `supabase.functions.invoke()`, verificar tanto `error` quanto `data` para extrair mensagens de erro mais detalhadas
- Logar o corpo completo da resposta para debug

#### 3. Reset de sessões com falha 401

- Criar uma query para resetar `recovery_sent = false` e `recovery_attempts_count = 0` nas sessões que falharam com erro 401 (anteriores à correção), permitindo que sejam retentadas na próxima execução do cron

---

### Arquivos modificados

1. `supabase/functions/stripe-webhook/index.ts` — fallback para resolver subscription quando `invoice.subscription` é null
2. `supabase/functions/recover-abandoned-checkout/index.ts` — melhorar log de erros do `.invoke()`
3. Migration SQL — reset das sessões de checkout que falharam com 401

### Deploy

Redeployar `stripe-webhook` e `recover-abandoned-checkout`, depois verificar nos logs e na tabela `dunning_attempts` que os próximos eventos são processados corretamente.

