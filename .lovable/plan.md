## Objetivo

Fechar as lacunas do fluxo de troca de plano para que funcione corretamente em todos os cenários reais (cartão M/Trim/Sem/Anual, PIX Asaas recorrente), com cobrança proporcional imediata e sem risco de cobrança dupla.

## Mudanças

### 1. `supabase/functions/change-subscription-plan/index.ts`

- **Importar `RECURRING_PRICES`** (ou replicar o mesmo mapa hardcoded usado em `create-checkout`) como fonte única de verdade para Trim/Sem/Anual. Mensal continua via `STRIPE_PRICE_*_MONTHLY` (env).
- **Suportar 4 ciclos** em `billing`: `monthly | quarterly | semiannual | yearly`. Atualizar validação e `resolvePriceId`.
- **Trocar `proration_behavior` para `always_invoice`** + manter `payment_behavior: 'error_if_incomplete'` para que a diferença seja cobrada agora no cartão e a UI fale a verdade.
- **Persistir `billing_cycle`** no `profiles.update` junto com `plan`, evitando lag se webhook falhar.
- **Bloquear explicitamente `provider='asaas'`**: ler `profiles.provider` (ou tabela de assinatura) e retornar 409 com mensagem clara ("Sua assinatura é PIX recorrente; troca de plano via suporte por enquanto").
- **Customer lookup**: quando `stripe.customers.list` retornar >1, escolher o que tem subscription ativa em vez de `limit:1` cego.

### 2. `src/components/portal/ChangePlanDialog.tsx`

- **Receber `provider` e `currentBilling` como props** (vindos do perfil já carregado no Portal).
- **Bloquear abertura/CTA quando `provider==='asaas'`**: trocar botão "Trocar plano" por aviso "Pra trocar de plano no PIX, fala com a gente" + link de suporte.
- **Toggle de ciclo com 4 opções** (Mensal / Trimestral / Semestral / Anual), refletindo os preços reais do `RECURRING_PRICES`.
- **Centralizar preços num único objeto** compartilhado (novo `src/lib/plan-pricing.ts`) consumido pelo dialog e por qualquer outro componente que mostre preço, evitando divergência com o backend.
- Texto do confirm: "A diferença é cobrada agora no seu cartão" (alinhado com `always_invoice`).

### 3. `src/lib/plan-pricing.ts` (novo)

- Exporta `PLAN_PRICES[plan][cycle] = { displayMonthly, totalCharge, label }` para os 12 SKUs cartão.
- Fonte única de verdade entre Portal, CheckoutV2 e qualquer dialog futuro.

### 4. Memória

- Atualizar `mem://features/subscription/plan-change-limits`: agora cobre M/Trim/Sem/Anual cartão + bloqueio explícito de PIX Asaas + uso de `always_invoice`.
- Atualizar `mem://technical/stripe/recurring-prices-v2`: passa a ser importado também pelo `change-subscription-plan`.

## Fora de escopo (fica pra depois, com aviso na memória)

- **Troca de plano para usuários PIX Asaas**: exige criar nova `subscription` no Asaas, cancelar a antiga e reconciliar. Tratado via suporte por enquanto — UI já bloqueia.
- **Downgrade com crédito**: `always_invoice` em downgrade gera invoice de R$ 0 + crédito no próximo ciclo (comportamento padrão Stripe, ok).

## Verificação

- `curl_edge_functions` em `change-subscription-plan` com um `userId` de teste cartão mensal → trimestral; conferir invoice criada com `prorate` no Stripe Dashboard.
- Conferir no Portal que botão fica desabilitado para usuário PIX Asaas.
- Conferir que `profiles.plan` e `profiles.billing_cycle` foram atualizados após sucesso.
