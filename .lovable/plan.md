## Verificação da implementação "Fallback silencioso Semanal → Mensal"

### O que já está correto ✅

**Stripe (`create-checkout`)**

- `effectiveTrial` e `returningCustomerMonthly` como `let`, com rebaixamento silencioso quando `hasStripeHistory || hasAsaasHistory`.
- Se retornante: `priceId = PRICES[plan].monthly` (STRIPE_PRICE_*_MONTHLY, recorrente cheio), cai no `else` de `subscription` mode, com `custom_text.submit.message` explicando "Você já foi cliente da AURA. Esta é a assinatura mensal recorrente de R$ 29,90/mês…".
- `displayPrice` puxa do `planPrices[plan]["monthly"]` — bate certinho (R$ 29,90 / 49,90 / 79,90).
- Metadata da session + subscription marcam `returning_customer=true`, `original_flow=weekly_blocked` (auditável no Stripe Dashboard).
- Log renomeado pra `effectiveTrial` e resposta inclui `returning_customer` pro front instrumentar.

**Asaas (`criar-cartao-asaas`)**

- `useTrial` virou `let`; retornante → `useTrial=false` + `returningCustomerMonthly=true`.
- Cai no branch `else` (linha 446-478) que faz `POST /subscriptions` com `cycle=CYCLE_MAP.monthly = "MONTHLY"` e `value=amountDecimal` (R$ 29,90 cheio, sem R$ 6,90).
- Resposta inclui `returning_customer` pro front.

**Frontend (`CheckoutV2.tsx` + `AsaasCardForm.tsx`)**

- Removidos: `weeklyBlockedNotice`, `triggerWeeklyBlockedFallback`, banner âmbar, ring no toggle Mensal, handler `onWeeklyBlocked`, tratamento de 409.
- `AsaasCardForm` agora chama `onSuccess({ returningCustomerMonthly })`.
- `trackReturningCustomerMonthly("stripe" | "asaas")` disparado nos dois caminhos.

### Ajustes recomendados (pequenos, opcionais)

**1. `/obrigado` — reconhecer o retornante**
Hoje mostra a mesma mensagem pra todo mundo. Vale ler `?session_id` (Stripe) e, se `metadata.returning_customer === "true"`, trocar o headline por algo tipo "Bem-vindo de volta 👋 — sua Mensal está ativa." Reforça que a promoção foi intencional e evita ticket "cadê meu Semanal de R$ 6,90?".

**2. WhatsApp de boas-vindas**
Mesmo racional: hoje dispara o template padrão de welcome. Pra retornantes seria bom uma variação "Que bom te ver de volta — a partir de hoje é Mensal recorrente." Se aceitar, precisa criar um `ContentSid` novo no Twilio; se não, no mínimo suprimir o pedaço "Você tem 7 dias por R$ 6,90" caso exista no template atual.

**3. Métrica no Admin**
`AdminEngagement.tsx` já tem KPIs. Adicionar "Retornantes rebaixados p/ Mensal (30d)" consultando `stripe_subscriptions.metadata->>'returning_customer' = 'true'` + Asaas equivalente ajuda a medir volume real do caso.

**4. Falta: hardening do `PRICES[plan].monthly` no Stripe**
O `throw` que adicionei protege runtime, mas vale checar no boot da função (uma vez, no topo) que os 3 secrets `STRIPE_PRICE_{ESSENCIAL,DIRECAO,TRANSFORMACAO}_MONTHLY` estão setados — falha rápida em vez de derrubar o checkout do cliente.

**5. Teste manual sugerido antes de considerar fechado**

- Simular retornante Stripe: usar email com histórico + escolher Semanal → conferir no Embedded Checkout se aparece R$ 29,90/mês e a mensagem custom_text.
- Simular retornante Asaas: mesmo email → conferir no Asaas Dashboard se a subscription saiu `cycle=MONTHLY value=29.90` e a 1ª cobrança foi R$ 29,90 (não R$ 6,90).
- Cliente novo: garantir que o fluxo Semanal (R$ 6,90) continua funcionando.

### Nada urgente ou quebrado

A implementação principal está sólida e coerente. Os 5 pontos acima são melhorias de UX/observabilidade — não bloqueiam o release.

### Como quer proceder?

- **A** — Implemento tudo (1–4) + valido com curl no `create-checkout` simulando retornante.
- **B** — Só os pontos 1 e 4 (mensagem no /obrigado + hardening dos secrets).
- **C** — Nenhum ajuste agora, só rodo o teste manual (5) e valido logs.  
  
APROVAR O B