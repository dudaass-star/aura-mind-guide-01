# Atualizar memória de planos e pagamentos

Confirmado: PIX (Asaas) + Cartão (Stripe) só, sem boleto. `criar-pix-asaas` e `Checkout.tsx` são legado/morto.

## Arquivos a atualizar

- `mem://business/payment-methods-current-state` — reescrever: Cartão Stripe + PIX Asaas recorrente nos 4 ciclos, sem boleto, CheckoutV2 (/v2) canônico.
- `mem://business/subscription-usage-limits` — adicionar todos os 12 preços (3 planos × 4 ciclos) e Plano Semanal.
- `mem://business/paid-trial-strategy` — esclarecer que Plano Semanal só convive com mensal cartão.
- `mem://technical/stripe/platform-configuration` — registrar `RECURRING_PRICES` hardcoded de trim/sem/anual.

## Arquivos a criar

- `mem://features/payments/pix-recorrente-asaas` — Asaas `/subscriptions`, mapa de cycles, `applyAuraNotificationDefaults` (só email PAYMENT_RECEIVED/OVERDUE).
- `mem://technical/stripe/recurring-prices-v2` — `RECURRING_PRICES` hardcoded (price_1TZyo…) em `create-checkout`.
- `mem://features/subscription/plan-change-limits` — `change-subscription-plan` cobre só M/Y cartão Stripe; Trim/Sem e PIX Asaas ficam sem flow nativo.
- `mem://technical/payments/legacy-dead-paths` — `criar-pix-asaas`, `Checkout.tsx` (/checkout), env `STRIPE_PRICE_*_PIX_YEARLY` (boleto) e branch `isBoletoPayment` são caminho morto.

## Index

- Substituir Core line "Stripe Connect (Credit Card only)" por "Stripe (cartão, 4 ciclos) + Asaas (PIX recorrente, 4 ciclos). Sem boleto."
- Atualizar descrições das 4 entradas existentes.
- Adicionar as 4 novas entradas.
