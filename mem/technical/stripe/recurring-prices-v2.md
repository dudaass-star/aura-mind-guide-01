---
name: RECURRING_PRICES V2 (grade nova de ciclos longos)
description: Price IDs e valores dos ciclos Trim/Sem/Anual após a redução agressiva de Ago/2026 (Essencial 19,90/14,90/9,90)
type: feature
---
Grade vigente (equivalente mensal · total cobrado):

| Plano | Mensal | Trimestral | Semestral | Anual |
|---|---|---|---|---|
| Essencial | 29,90 | 19,90 · 59,70 | 14,90 · 89,40 | 9,90 · 118,80 |
| Direção | 49,90 | 33,90 · 101,70 | 24,90 · 149,40 | 16,90 · 202,80 |
| Transformação | 79,90 | 53,90 · 161,70 | 39,90 · 239,40 | 26,90 · 322,80 |

Descontos: Tri −33%, Sem −50%, Anual −67% (vs mensal).

Price IDs Stripe novos (mesmos produtos de antes; os 9 preços antigos foram arquivados `active:false`):
- Essencial: Tri `price_1U0pUoQU15XnZ7Vvqc4DcNi2` · Sem `price_1U0pVHQU15XnZ7VvvCChiLHP` · Anual `price_1U0pW5QU15XnZ7VvBVHvYUnU`
- Direção: Tri `price_1U0pWPQU15XnZ7VviqtmRsYR` · Sem `price_1U0pWhQU15XnZ7VvEveOB9DP` · Anual `price_1U0pYFQU15XnZ7Vvu6ylUTEM`
- Transformação: Tri `price_1U0pa7QU15XnZ7VvEqEFDPWg` · Sem `price_1U0paYQU15XnZ7VvmTzRNyGG` · Anual `price_1U0pavQU15XnZ7VvQErVkBV7`

Onde vive: `create-checkout` e `change-subscription-plan` (hardcoded); `stripe-webhook` e `backfill-billing-cycle` mantêm mapeamento dos IDs novos **e** antigos (assinaturas legadas continuam válidas). Asaas (PIX recorrente e cartão) usa os centavos em `criar-pix-recorrente-asaas`, `criar-cartao-asaas`, `criar-pix-asaas`. UI: `src/lib/plan-pricing.ts`, `src/pages/CheckoutV2.tsx`, `src/components/Pricing.tsx`.

**Regra de posicionamento:** ciclo longo (sobretudo o Anual) é oferta de **entrada** no checkout e upgrade voluntário no portal. Nunca entra em dunning nem no fluxo de cancelamento — quem está em churn quer gastar menos, não pagar 118 de uma vez. A escada de retenção segue só em mensal/semanal (2 avisos → 30% → Lite → Base).