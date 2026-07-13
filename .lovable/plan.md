
## Objetivo

Habilitar pagamento com **cartão via Asaas** em paridade com o Stripe: todos os 4 ciclos (Mensal, Trimestral, Semestral, Anual), com **seletor no admin** pra decidir qual gateway processa cartão. No checkout, quando o ciclo permitir, o usuário escolhe entre **à vista recorrente** ou **parcelado**.

> Status atual: nada implementado ainda. Este plano precisa da sua aprovação pra sair do modo plano.

## Como fica pro cliente final

- **Checkout `/v2`**: visual igual. Ao escolher cartão:
  - Gateway ativo = **Stripe** → fluxo atual (Stripe Checkout hospedado).
  - Gateway ativo = **Asaas** → formulário nativo de cartão (Asaas não tem checkout hospedado equivalente). Em Trim/Sem/Anual aparece toggle **"À vista recorrente"** vs **"Parcelar em Nx"** (2x a 12x conforme ciclo).
- Welcome, portal e cobrança seguem idênticos — só muda quem processa.

## Como fica pro admin

Card novo em `/admin/settings`:
- **Gateway de cartão** (Select): `Stripe` (default) / `Asaas`
- Persistido em `system_config.card_gateway`, lido por `create-checkout` e pelo `CheckoutV2` antes de rotear.
- Trocar o seletor **não mexe em assinaturas ativas** — só afeta novos checkouts. Assinaturas antigas continuam no gateway que as criou (usaremos `profiles.card_gateway` pra saber).

## Escopo técnico

### 1. Migration
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_gateway text
  CHECK (card_gateway IN ('stripe','asaas'));

INSERT INTO public.system_config (key, value)
VALUES ('card_gateway', '"stripe"')
ON CONFLICT (key) DO NOTHING;
```

### 2. Edge function nova `criar-cartao-asaas`
- Recebe `{ userId, plan, billing, mode: 'recurring' | 'installment', installments?, cardData, holderInfo }`.
- Cria/reaproveita `customer` Asaas (mesma lógica de `criar-pix-recorrente-asaas`).
- **Recorrente**: `POST /subscriptions` com `billingType: CREDIT_CARD` + `creditCard` + `creditCardHolderInfo` (Asaas tokeniza e reutiliza nas próximas cobranças).
- **Parcelado**: `POST /payments` com `billingType: CREDIT_CARD` + `installmentCount` + `installmentValue`. Não é recorrente — no fim do ciclo pago, agenda renovação via `scheduled_tasks` (D-3).
- Grava `profiles.card_gateway = 'asaas'` na ativação.

### 3. Ajustes em `webhook-asaas`
- Já processa `PAYMENT_CONFIRMED` de qualquer `billingType`. Adicionar:
  - Distinguir cartão recorrente (subscription) vs parcelado (installment) pra calcular `plan_expires_at` corretamente (parcelado = 1 pagamento cobre o ciclo).
  - Não disparar dunning-whatsapp em parcelas futuras naturais.

### 4. Frontend — `CheckoutV2.tsx` + novo `AsaasCardForm`
- Hook `useCardGateway()` lê `system_config.card_gateway` (cacheado com React Query).
- Se `stripe` → `create-checkout` (rota atual).
- Se `asaas` → renderiza `AsaasCardForm` (número, validade, CVV, titular, CPF, endereço obrigatórios pelo Asaas) + toggle parcelamento nos ciclos elegíveis.
- Submit chama `criar-cartao-asaas` via `supabase.functions.invoke`.

### 5. Frontend — `AdminSettings.tsx`
- Card novo "Gateway de Cartão" com Select (Stripe/Asaas) + Save, mesmo padrão dos cards `ai_model` / `tts_model` existentes.

### 6. Portal — troca de plano
- `ChangePlanDialog` hoje roteia por `paymentMethod` (`card` → Stripe, `pix` → Asaas).
- Adaptar: quando `paymentMethod = 'card'` E `profile.card_gateway = 'asaas'` → chamar `change-asaas-plan` (adaptado pra aceitar `billingType: CREDIT_CARD` além de PIX). Mais simples que criar função nova.

### 7. Preços
- Nada novo. Cartão Asaas usa `value` direto (não exige `price_id` como Stripe). Reaproveita `PLAN_PRICES` em `lib/plan-pricing.ts`.

## Fora de escopo

- **3DS challenge Asaas** (fluxo `PAYMENT_AWAITING_RISK_ANALYSIS`) — Asaas faz internamente por padrão; UX de challenge no navegador fica pra depois se necessário.
- Migrar assinaturas Stripe existentes pra Asaas.
- Boleto (segue vetado).

## Risco importante — PCI

Cartão passará pelo nosso backend antes de chegar ao Asaas → escopo PCI-DSS sobe de **SAQ A** (Stripe hospedado) pra **SAQ A-EP**. Alternativa: usar link de checkout hospedado do Asaas, mas UX fica pior que hoje.

**Confirmar antes de codar**: seguimos com formulário nativo (SAQ A-EP) ou você prefere link hospedado do Asaas?

## Ordem de implementação

1. Migration (`profiles.card_gateway` + seed `system_config.card_gateway`).
2. Card do seletor em `AdminSettings.tsx`.
3. Edge function `criar-cartao-asaas` (recorrente primeiro).
4. `AsaasCardForm` + integração no `CheckoutV2`.
5. Ajustes em `webhook-asaas`.
6. Modo parcelado + agendamento de renovação.
7. Adaptar `change-asaas-plan` pra cartão.
