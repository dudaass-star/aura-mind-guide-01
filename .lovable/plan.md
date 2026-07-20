## Objetivo
Validar em produção que a inversão Semanal→Mensal para clientes retornantes está funcionando corretamente nos dois gateways, sem quebrar o fluxo de clientes novos.

## O que vou executar automaticamente (via curl)

**1. Stripe — retornante**
- POST `create-checkout` com email de retornante conhecido (`jefmarper@gmail.com`), `plan=direcao`, `billing=monthly`, `trial=true`.
- Validar na resposta:
  - `returning_customer: true`
  - `url` aponta pra Checkout Session válida
  - Session no Stripe: `mode=subscription`, price = `STRIPE_PRICE_DIRECAO_MONTHLY`, sem trial, `metadata.returning_customer=true`, `custom_text.submit.message` presente.

**2. Stripe — cliente novo (controle)**
- Mesmo POST com email inédito. Confirmar `returning_customer: false` e price = trial (R$ 9,90 pra Direção).

**3. Asaas — retornante**
- POST `criar-cartao-asaas` com email retornante + cartão de teste Asaas sandbox.
- Se `ASAAS_ENV=production`, pulo esse passo e só inspeciono o código path (não vou processar cartão real).
- Se sandbox disponível, validar `returning_customer: true` na resposta e no dashboard: subscription com `cycle=MONTHLY`, `value=29.90`.

**4. Asaas — cliente novo (controle)**
- Igual, com email inédito. Confirmar trial R$ 9,90.

**5. Hardening check**
- Simular chamada com secret ausente não é viável em prod; em vez disso valido nos logs do último deploy que o boot check rodou sem warning.

## O que fica pra teste manual do usuário
- **Fluxo visual completo** (Embedded Checkout renderizando o `custom_text.submit.message`; página `/obrigado` mostrando "Bem-vindo de volta 👋"): precisa navegador real com email retornante — te passo o link após o step 1.
- **Cobrança efetiva Asaas** (se estivermos em produção): só um cartão real confirma R$ 29,90 na 1ª fatura.

## Entregável
Relatório curto com:
- Status de cada um dos 4 casos (✅/❌ + evidência do payload)
- Screenshots/JSON do Stripe Dashboard quando aplicável
- Lista de qualquer divergência encontrada + correção proposta

## Riscos
- Nenhum: chamadas Stripe criam sessions descartáveis (não cobram sem `payment_method`); Asaas em sandbox idem. Nada é enviado ao cliente `jefmarper@gmail.com` — os tokens de auth não disparam WhatsApp/email de boas-vindas até o pagamento confirmar.
