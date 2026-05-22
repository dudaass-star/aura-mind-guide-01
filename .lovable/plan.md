## Resumo
Não mexer no `Checkout.tsx` v1. Aplicar tudo em `src/pages/CheckoutV2.tsx` e destravar a edge `criar-pix-asaas` (erro `Configuração ausente` = falta `ASAAS_API_KEY`).

## 1. Secret faltando
A edge já existe e o `ASAAS_WEBHOOK_TOKEN` está ok, mas **`ASAAS_API_KEY` não está configurado**. Vou abrir o formulário de secret pra você colar a chave de API do Asaas (Sandbox por enquanto). Sem isso o PIX continua dando 500.

## 2. Mudanças em `CheckoutV2.tsx`
- `BillingPeriod` → `"monthly" | "quarterly" | "semestral" | "yearly"`.
- `PlanConfig` ganha `quarterlyPrice`, `quarterlyMonthlyEquivalent`, `quarterlyDiscount` (11%), `semestralPrice`, `semestralMonthlyEquivalent`, `semestralDiscount` (30%). Anual continua 40%.
- Preencher os 6 valores novos:
  - Essencial: Trim R$ 79,90 / Sem R$ 125,90
  - Direção: Trim R$ 133,90 / Sem R$ 209,90
  - Transformação: Trim R$ 213,90 / Sem R$ 335,90
- Toggle de período: trocar os 2 botões (Mensal/Anual) por um seletor de **4 períodos** mantendo o visual do V2 (mesmo card, mesmas classes).
- Campo **CPF** (condicional: só renderiza quando o usuário clica em "Pagar com PIX").
- Botão **"Pagar com PIX — R$ X,XX"** abaixo do botão cartão, **só** aparece em `quarterly | semestral | yearly`. Mensal continua só cartão.
- `handlePixSubmit`: valida CPF, chama `supabase.functions.invoke('criar-pix-asaas', { body: { plan, billing, name, email, phone, cpf, valueInCents } })`.
- **Modal** (Dialog do shadcn) com QR Code (`<img src={...} />`), botão "Copiar código copia-e-cola" e instruções curtas ("Pague em até X horas. Liberação automática.").
- Tracking GA4 mantido no mesmo padrão (`trackAddPaymentInfo` com `payment_method: 'pix'`).

## Fora de escopo
- `Checkout.tsx` v1 — **não mexer** (fica como está, com as alterações anteriores).
- Migration `asaas_payments`, edges `criar-pix-asaas` / `webhook-asaas` — já existem, sem mudanças.
- Fluxo de cartão / Stripe / trial — intocados.
- Rotas — sem alteração (`/v2/checkout` continua sendo o V2).
