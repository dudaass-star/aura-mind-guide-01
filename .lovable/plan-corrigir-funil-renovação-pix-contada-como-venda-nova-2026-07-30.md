# Corrigir funil: renovação PIX contada como venda nova

## O que aconteceu

A "venda finalizada" de hoje no Funil de Checkout **não é uma venda nova**. É a renovação mensal de **Maria Conceição** (cliente desde 22/05, plano Essencial, PIX recorrente), R$ 29,90 recebidos em 30/07 06:26 BRT.

O pagamento chegou pelo caminho de fallback do PIX Automático Bacen (cobrança avulsa por customer). Nesse caminho, a linha foi gravada em `asaas_payments` **sem `asaas_subscription_id`**, embora o payload cru do Asaas traga `subscription: sub_7yc491mim2v5obqe`. A autorização PIX dela (`5e50c12e…`, ACTIVE) também está sem `asaas_subscription_id`.

Como o funil classifica renovação por `asaas_subscription_id`, uma linha sem esse campo é tratada como PIX avulso novo — e entra tanto em "criados" quanto em "finalizados" do período.

## O que corrigir

1. **Persistir o vínculo da assinatura no webhook** (`webhook-asaas`)
   Nos três caminhos de inserção de pagamento, gravar `asaas_subscription_id` com fallback em cascata: valor da autorização → `payment.subscription` do payload → id da autorização. Também gravar `subscriptionId` na autorização quando o pagamento revelar o vínculo, para os próximos ciclos.

2. **Endurecer a detecção de renovação no funil** (`admin-engagement-metrics`)
   Além da regra atual por `asaas_subscription_id`, tratar como renovação quando:
   - o payload cru tiver `subscription` preenchido; ou
   - o mesmo email/telefone já tiver pagamento pago **anterior ao início do período**, ou perfil criado antes do período.
   Assim, qualquer linha órfã futura deixa de virar "venda nova".

3. **Backfill dos dados atuais**
   - Preencher `asaas_subscription_id` nas linhas de `asaas_payments` que têm `raw_payload->>'subscription'` (inclui o pagamento de hoje).
   - Preencher `asaas_subscription_id` na autorização ACTIVE da cliente.

## Resultado esperado

O funil de 29/07–30/07 volta a mostrar checkouts iniciados sem venda nova (nenhuma conversão real nas últimas 48h), e renovações PIX param de inflar a taxa de conversão.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts`: inserts nos blocos de renovação por `subscription`, PIX Automático por `pixAutomaticAuthorizationId` e fallback por `customer`.
- `supabase/functions/admin-engagement-metrics/index.ts` (~1400): função `isRenewal` e montagem de `asaasCreatedKeysInPeriod` / `asaasConfirmedKeysInPeriod`.
- Backfill via operação de dados (UPDATE), não migração de schema.
