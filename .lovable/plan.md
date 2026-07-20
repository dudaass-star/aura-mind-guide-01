## Confirmação sobre o catálogo (pergunta que você fez)

Sim, **os planos sem Semanal já existem em Stripe e Asaas** — não precisamos criar produto novo. O que muda é só a rota que o backend escolhe pro retornante.

- **Stripe cartão sem trial**: `STRIPE_PRICE_ESSENCIAL_MONTHLY` (R$ 29,90/mês), `STRIPE_PRICE_DIRECAO_MONTHLY` (R$ 49,90/mês), `STRIPE_PRICE_TRANSFORMACAO_MONTHLY` (R$ 79,90/mês) — todos já em secrets, todos recorrentes mensais sem período de teste.
- **Trim/Sem/Anual cartão** (`RECURRING_PRICES` hardcoded) e **Trim/Sem/Anual PIX Asaas** — hoje **já não passam pelo Semanal**. Retornante que escolhe esses períodos já cai limpo. Nada a mudar aqui.
- **Asaas cartão mensal**: `criar-cartao-asaas` já sabe criar `subscription` mensal recorrente — basta o front mandar `trial: false` (ou o backend forçar isso pro retornante).

Onde o "Semanal contamina" hoje é **só no toggle Mensal**. É esse único caso que precisa ser tratado.

## Escopo (enxuto)

### 1. Backend — Stripe (`supabase/functions/create-checkout/index.ts`)

No bloco `if (trial)` (linha 308), após detectar `hasStripeHistory || hasAsaasHistory`:

- **Trocar o `return 409`** por um **fallback silencioso**: promover o request pra Mensal recorrente sem trial (`PRICES[plan].monthly`), `mode = "subscription"`, mantendo o mesmo `customer`, sem trial. Metadados: `returning_customer: "true"`, `original_flow: "weekly_blocked"`.
- Manter `custom_text.submit.message` explícito no Embedded Checkout: *"Você já foi cliente. Esta é a assinatura mensal recorrente de R$ XX,XX. Cancele quando quiser."* — garante que o cliente veja o valor real antes de confirmar.

### 2. Backend — Asaas (`supabase/functions/criar-cartao-asaas/index.ts`)

Mesma inversão: se retornante detectado no path `trial=true`, criar `subscription` Asaas com `cycle=MONTHLY` no valor cheio (R$ 29,90 / 49,90 / 79,90) em vez de retornar 409.

### 3. Frontend — remover o banner e o callback de bloqueio

- `src/pages/CheckoutV2.tsx`:
  - Remover: `weeklyBlockedNotice`, banner âmbar, `triggerWeeklyBlockedFallback`, ring/pulse no toggle Mensal, tratamento de 409 nos dois handlers.
  - Manter tratamento genérico de erro.
- `src/components/checkout/AsaasCardForm.tsx`:
  - Remover prop `onWeeklyBlocked` (sem 409 pra tratar).
- `src/lib/ga4.ts`:
  - Renomear `trackWeeklyRedirectToMonthly` → `trackReturningCustomerMonthly`, disparado quando o backend retornar `returning_customer: true` no JSON.

## Fluxo final

```text
Retornante clica "Começar trial por R$ 6,90"  (toggle Mensal)
        │
        ▼
Backend detecta histórico (Stripe OU Asaas)
        │
        ▼
Monta Mensal recorrente cheio (STRIPE_PRICE_*_MONTHLY ou Asaas cycle=MONTHLY)
        │
        ▼
Embedded Checkout / form Asaas abre com:
  • Preço: R$ 29,90/mês (ou 49,90 / 79,90)
  • Texto: "Você já foi cliente. Assinatura mensal recorrente. Cancele quando quiser."
        │
        ▼
Cliente confirma ou fecha (se fechar, volta pro /v2/checkout e pode escolher Trim/Sem/Anual)
```

Trim/Sem/Anual seguem inalterados — retornante que escolher esses períodos vai direto pro recorrente sem passar nem perto do Semanal (já é assim hoje).

## Riscos

1. **Choque de preço R$ 6,90 → R$ 29,90.** Mitigado por `custom_text.submit.message` + o valor grande do Embedded Checkout; sem tela extra "escolha outro plano".
2. **Retornante quer Trim/Anual em vez de Mensal.** Se fechar o Embedded, cai de volta no `/v2/checkout` com o toggle disponível.

## Ordem de execução

1. `create-checkout`: substituir 409 por fallback Mensal recorrente.
2. `criar-cartao-asaas`: mesma substituição.
3. Front: remover banner, callback, ring, toast.
4. GA4: renomear evento.
5. Deploy edge functions + smoke com `jefmarper@gmail.com` (retornante) — deve abrir Embedded no valor cheio, sem 409.
