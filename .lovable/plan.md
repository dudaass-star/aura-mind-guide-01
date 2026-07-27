## O que verifiquei (dados reais, não suposição)

- **Preços Stripe existem e estão ativos em produção**: `price_1TwR9yQU15XnZ7Vv59okBz23` (R$ 19,90/mês) e `price_1TwRA2QU15XnZ7Vvt0zU4HNa` (R$ 9,90/mês), ambos `active: true`, `livemode: true`, recorrentes mensais.
- **Asaas (cartão e PIX)** não usa "plano" cadastrado: `cancel-subscription` cria uma `/subscriptions` nova com `value` 19.90 / 9.90 e deleta a antiga. Cartão reusa `creditCardToken`; PIX gera novo QR no `nextDueDate`. Ambos os caminhos existem e estão implementados.
- **Roteamento por gateway** em `cancel-subscription` está correto (Asaas por `asaas_customer_id` + último `payment_method`, senão Stripe).
- **Colunas de auditoria existem**: `profiles.plan_tier`, `cancellation_feedback.save_tier/gateway`, tabela `retention_events`.
- **Nada disso rodou de verdade ainda**: `cancellation_feedback` com `save_tier in (lite, base, discount_30)` = **0 linhas**; `retention_events` = 3 linhas (testes). Em `dunning_attempts`, os 43 envios com `message_sid` usaram **só o template genérico** `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` — nenhum SID de oferta saiu ainda.

## Os 4 furos reais encontrados

**1. O link da oferta não leva à oferta (crítico de conversão)**
`/cancelar?t=<token>&offer=lite` — a página `CancelSubscription.tsx` lê o `offer`, mas **ignora o `t=`**. O usuário que clica no botão do WhatsApp cai numa tela pedindo o telefone, depois vê o recap, depois escolhe um motivo, e só então vê o card destacado. São 3 passos antes da oferta prometida na mensagem.

**2. Downgrade no Stripe deixa a fatura vencida em aberto (crítico de receita)**
Em `downgrade_to_lite/base` o código faz `subscriptions.update` com `proration_behavior: "none"` e marca `profiles.status = 'active'`, mas **não paga nem cancela a invoice `open` do ciclo que falhou**. A assinatura continua `past_due`, os Smart Retries seguem tentando o valor cheio antigo e, no fim da escada, o Stripe cancela a assinatura — mesmo o cliente tendo aceitado a oferta. O perfil fica "active" no banco, dessincronizado do Stripe.

**3. Tentativas antigas queimam a cota da escada nova**
`sendDunningWhatsApp` conta todos os envios com `message_sid` por subscription e corta em `DUNNING_MAX_ATTEMPTS = 3`. Como já existem 43 envios do template genérico, os inadimplentes atuais entram direto em `limit_reached` e **nunca receberão nenhum degrau de oferta**.

**4. `plan_tier` é escrito e nunca lido**
Nenhum lugar do código lê `profiles.plan_tier`. O downgrade grava o tier, mas nenhum limite (áudio, sessões) muda e o portal não mostra o plano Lite/Base. Além disso, os price IDs de retenção não estão em `RECURRING_PRICES` no `stripe-webhook`, então `customer.subscription.updated` loga `Unknown priceId` e deixa `profiles.plan` com o plano antigo.

## O que fazer

**A. Link direto para a oferta (frontend + edge)**
- `CancelSubscription.tsx`: ler `t=<token>`; havendo token, chamar `cancel-subscription` com `{ token, action: "check" }` e pular direto para `offer_ladder` com o tier do `offer` no topo, sem pedir telefone nem motivo.
- `cancel-subscription`: aceitar `token` como fonte de identidade (resolver `user_portal_tokens` → `profiles.phone`) em todas as ações, mantendo o fluxo por telefone intacto.

**B. Fechar o ciclo financeiro no Stripe**
No `downgrade_to_lite/base`, após trocar o price: buscar as invoices `open` da subscription e cobrar imediatamente o novo valor (`invoices.voidInvoice` da antiga + `subscriptions.update` com `billing_cycle_anchor: "now"` e `proration_behavior: "none"`), confirmando que a subscription volta a `active`. Só marcar `profiles.status = 'active'` se o Stripe confirmar; caso contrário, devolver mensagem de falha honesta em vez de "ajustado".

**C. Cota separada para a escada de ofertas**
Contar tentativas apenas sobre envios cujo `template_sid` está em `DUNNING_OFFER_LADDER`, ignorando o histórico do template genérico. Assim os inadimplentes atuais começam do degrau 1.

**D. Coerência de plano pós-downgrade**
- Adicionar os dois price IDs de retenção ao mapa do `stripe-webhook` como `{ plan: 'essencial', billing_cycle: 'monthly' }` (mantém entitlements atuais, elimina o `Unknown priceId`).
- Exibir o tier no portal (`SobreVoceTab` / `ChangePlanDialog`) para o downgrade ser perceptível.

**E. Teste end-to-end antes de ligar**
Rodar um caso por gateway (Stripe past_due, Asaas cartão, Asaas PIX) e conferir: `retention_events` com `accepted`+`applied`, `cancellation_feedback.save_tier`, status real no gateway e `profiles.status`.

## Ponto a decidir

O Lite (R$ 19,90) e o Base (R$ 9,90) devem **reduzir limites** (áudio/sessões) ou manter o plano atual por preço menor? Hoje o código mantém tudo. Se quiser reduzir, é preciso ler `plan_tier` na lógica de orçamento — me diz e incluo.
