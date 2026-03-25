

# Correção: Rastrear Pagamento Pós-Trial via Stripe Webhook

## Problema central

Quando um usuário cadastra cartão e inicia um trial de 7 dias no Stripe, ao final do trial o Stripe tenta cobrar automaticamente. Hoje o webhook **não trata** os eventos `invoice.paid` nem `invoice.payment_failed`. Resultado:

- Se o pagamento **funciona**: o perfil fica como `trial` para sempre (nunca vira `active`)
- Se o pagamento **falha**: ninguém sabe — o usuário continua como `trial` sem acesso real
- Os 13 "trials expirados com cartão" provavelmente incluem usuários que **já pagaram** mas o sistema nunca atualizou

## Plano

### 1. Adicionar campo `payment_failed_at` na tabela `profiles`
Migração SQL para adicionar `payment_failed_at timestamptz` — permite identificar e medir falhas de pagamento.

### 2. Tratar novos eventos no `stripe-webhook/index.ts`

**`invoice.paid`** (primeiro pagamento pós-trial):
- Buscar customer pelo `customer` ID → pegar phone dos metadata
- Atualizar profile: `status = 'active'`, `converted_at = now()`, `payment_failed_at = null`
- Logar conversão real

**`invoice.payment_failed`**:
- Buscar customer → phone
- Atualizar profile: `payment_failed_at = now()`, manter status `trial`
- Logar falha para visibilidade no painel

**`customer.subscription.updated`** (trial_end → active):
- Quando `status` muda de `trialing` para `active`, atualizar profile como ativo

### 3. Atualizar métricas no `admin-engagement-metrics/index.ts`

Adicionar novas métricas:
- `paymentFailedCount`: perfis com `payment_failed_at IS NOT NULL` e `status = 'trial'`
- `activeSubscribers`: perfis com `status = 'active'` e `trial_started_at IS NOT NULL` (assinantes reais)
- Corrigir `expiredTrials`: separar "expirado aguardando cobrança" de "falha de pagamento"

### 4. Atualizar UI no `AdminEngagement.tsx`

Adicionar cards:
- **Assinantes Ativos** (pagando agora)
- **Falha de Pagamento** (trial expirado + pagamento falhou)
- Ajustar funil all-time para refletir conversões reais via `converted_at`

### 5. Registrar webhook events no Stripe Dashboard

Garantir que os eventos `invoice.paid`, `invoice.payment_failed` e `customer.subscription.updated` estejam habilitados no endpoint do webhook no Stripe.

## Resultado esperado

- Trials que pagaram com sucesso → automaticamente viram `active` com `converted_at`
- Trials com falha de pagamento → visíveis no painel com data da falha
- Funil mostra números reais: 25 cadastraram → X pagaram → Y falharam
- Os 13 "expirados" serão reclassificados corretamente

## Detalhes técnicos

- Arquivos: `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/admin-engagement-metrics/index.ts`, `src/pages/AdminEngagement.tsx`
- Migração: adicionar `payment_failed_at` em `profiles`
- Nota: o usuário precisa verificar no Stripe Dashboard se os eventos `invoice.paid` e `invoice.payment_failed` estão configurados no endpoint do webhook

