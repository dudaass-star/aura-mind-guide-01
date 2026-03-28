

## Corrigir cobrança dos clientes em trial existentes

### Diagnóstico confirmado
- **Todos os 9 clientes past_due** têm payment intents com status `requires_payment_method` — o cartão NÃO foi salvo durante o checkout com trial
- **10+ clientes em trial** que serão cobrados nos próximos dias têm o mesmo problema potencial — passaram pelo checkout antigo (sem `setup_future_usage: 'off_session'`)
- A função `fix-subscription-payment-methods` reportou "ok" porque o Stripe mostra `default_payment_method` na subscription, mas esse PM pode estar vazio/inválido na prática

### Plano de ação

#### 1. Criar função `attach-checkout-payment-methods`
Nova edge function que:
- Lista todas as subscriptions `trialing` (e opcionalmente `past_due`)
- Para cada subscription, busca o **Checkout Session original** via `stripe.checkout.sessions.list({ subscription })`
- Do checkout session, extrai o `setup_intent` que contém o payment method coletado
- Verifica se esse payment method está **realmente anexado** ao customer
- Se não estiver, **anexa o payment method** e define como default na subscription E no customer
- Para clientes `past_due`, tenta retry da invoice após anexar o cartão

#### 2. Rodar a função em modo diagnóstico primeiro
- Modo `dry_run=true` para ver quais clientes realmente estão sem cartão válido
- Depois `dry_run=false` para corrigir

### Detalhes técnicos
- Usar `stripe.checkout.sessions.list({ subscription: sub.id })` para encontrar a sessão original
- Expandir `setup_intent.payment_method` para obter o PM real
- Usar `stripe.paymentMethods.attach()` se o PM existir mas não estiver anexado
- Definir `default_payment_method` na subscription e `invoice_settings.default_payment_method` no customer

### Resultado esperado
- Clientes em trial terão o cartão corretamente salvo antes da cobrança
- Clientes past_due poderão ter a invoice retentada automaticamente
- Sem impacto em clientes que já estão pagando normalmente

