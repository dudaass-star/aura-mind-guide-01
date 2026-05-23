## Objetivo

Unificar `asaas_payments` (PIX) com Stripe nas métricas do dashboard admin (`admin-engagement-metrics`), pra parar de "perder" clientes PIX nos números.

## O que muda

Só o edge function `supabase/functions/admin-engagement-metrics/index.ts`. Nada de UI, nada de schema.

### 1. MRR
Somar `asaas_payments` com `status IN ('CONFIRMED','RECEIVED')` e `billing_period = 'monthly'` ao MRR Stripe. Para `quarterly`/`yearly`, normalizar pra valor mensal equivalente (÷3, ÷12).

### 2. Clientes Ativos (segmentado)
Hoje só conta Stripe `active`/`trialing`. Incluir profiles com `asaas_customer_id` presente E que tenham pelo menos 1 `asaas_payments` com status `CONFIRMED`/`RECEIVED` no período vigente da cobrança (monthly = últimos 31d, quarterly = últimos 93d).

### 3. Funil de Checkout
Adicionar linha "PIX (Asaas)" no breakdown: total de `asaas_payments` criados no dia vs. quantos viraram `CONFIRMED`/`RECEIVED`. Mantém o funil Stripe separado visualmente, mas soma no totalizador.

### 4. Funil de Conversão (semanal→mensal)
**Não aplicar.** Asaas não tem trial semanal — fluxo PIX entra direto no mensal. Manter funnel exclusivo Stripe e adicionar nota explicativa "(apenas cartão)".

### 5. Churn
Adicionar churn PIX: profile com último `asaas_payments` recebido há mais de 35 dias (monthly) sem renovação. Somar ao churn involuntário Stripe. Reportar `churnSourcePix` separadamente no payload pra rastreabilidade.

### 6. Taxa de finalização
Recalcular: `(stripe_checkouts_completed + asaas_payments_confirmed) / (stripe_sessions + asaas_payments_created)` no dia.

## Payload de resposta

Adicionar campos novos sem quebrar os existentes:
- `mrrPix`, `mrrTotal` (= stripe + pix)
- `activeUsersPix`, `activeUsersTotal`
- `checkoutFunnelPix: { created, confirmed }`
- `churnPixCount`

Frontend admin (`/admin/engagement`) só precisa exibir os totais novos — sugiro fazer numa segunda rodada após validar os números.

## Filtros importantes

- Excluir emails `e2e+*@olaaura.com.br` em todas as contagens novas (consistência com a discussão anterior).
- Status PIX válidos pra "pago": `CONFIRMED`, `RECEIVED`. Ignorar `PENDING`, `OVERDUE`, `REFUNDED`.
- Timezone BRT pra todos os recortes diários.

## Fora de escopo

- Mudanças na UI admin (faço depois que confirmar os números no payload).
- Webhook Asaas (já funciona).
- Funil de conversão semanal (PIX não tem esse fluxo).
