# Dunning: 2 avisos antes da escada de descontos (Stripe + Asaas)

## O que muda

Hoje o primeiro WhatsApp de cobrança falhada já é a oferta de 30%. O template de aviso ("atualize seu pagamento") existe, mas nunca é usado porque os 3 degraus da escada ocupam as 3 tentativas do ciclo.

Nova cadência por **ciclo de cobrança**, igual para todos os meios de pagamento:

| Falha no ciclo | WhatsApp | Conteúdo |
|---|---|---|
| 1ª | Aviso | template utility, link direto de pagamento |
| 2ª | Aviso | template utility, link direto de pagamento |
| 3ª | Oferta | 30% off por 3 meses |
| 4ª | Oferta | Plano Lite R$ 19,90 |
| 5ª+ | — | nada (teto do ciclo) |

O e-mail de falha de pagamento continua como está (a cada evento de falha, com link de retomada).

O degrau "Base R$ 9,90" sai do WhatsApp e continua disponível dentro da página /cancelar, como já definido antes. O template Twilio dele fica ocioso (não é apagado).

## Onde vale

A decisão vive num único helper compartilhado, então a mesma cadência passa a valer em:

- **Stripe (cartão)** — cada `invoice.payment_failed` das Smart Retries (até 4 no ciclo) conta uma falha.
- **Asaas (cartão)** — cada retentativa de recharge que não confirma (D0 / D+2 / D+4 / D+7) conta uma falha.
- **Asaas (PIX recorrente e PIX Automático)** — cada `PAYMENT_OVERDUE` conta uma falha.

## Dois ajustes necessários que o plano original não cobria

**1. A contagem precisa ser por ciclo, não por assinatura.**
Hoje o escopo da contagem é `subscription_id`, que é o mesmo mês após mês. Ou seja: a escada nunca reinicia em um novo ciclo — quem estourou o teto uma vez fica silenciado para sempre naquela assinatura. Isso já é um defeito atual e passa a ser bloqueante quando os avisos entrarem na conta.
Correção: o escopo passa a ser o **ciclo**, na ordem `invoice_id` → `payment_id` → `subscription_id`.
- Stripe: `invoice_id` já vem preenchido em 119 de 121 registros de WhatsApp, e as Smart Retries reemitem o evento na **mesma** invoice — encaixe exato com 2 avisos + 2 ofertas.
- Asaas: `payment_id` é a cobrança do ciclo e é estável entre as retentativas de cartão e no `PAYMENT_OVERDUE` do PIX.

**2. Sem o escopo por ciclo, os avisos antigos queimariam a cota.**
Existem 43 envios do template genérico marcados como entregues entre 30/06 e 24/07, ligados a assinaturas ainda vivas. Se a contagem passar a incluir o template genérico mantendo o escopo por assinatura, esses clientes já entrariam direto no meio da escada (ou no teto). Com o escopo por ciclo esses registros ficam presos ao ciclo antigo e não contaminam o próximo.

## Detalhes técnicos

`supabase/functions/_shared/dunning-whatsapp.ts`:

- `DUNNING_NOTICE_STEPS = 2`: tentativas 1 e 2 usam `DUNNING_CONTENT_SID` (utility, sem restrição de horário, `{{2}}` = URL completa `/pagamento?t=<token>`).
- `DUNNING_OFFER_LADDER` fica com dois degraus (`discount_30`, `lite`), indexados por `attemptNumber - DUNNING_NOTICE_STEPS`.
- `DUNNING_MAX_ATTEMPTS = 4` (2 avisos + 2 ofertas).
- Escopo de contagem: `invoiceId` → `paymentId` → `subscriptionId`.
- A contagem passa a incluir **todos** os envios com `whatsapp_sent = true` do escopo (aviso genérico + degraus de oferta), em vez de filtrar só pelos SIDs da escada.
- Janela de marketing 08h–21h BRT continua valendo apenas para os degraus de oferta; avisos utility disparam a qualquer hora.
- `forceAttemptNumber` (tarefa adiada `dunning_offer_whatsapp`) continua respeitado: o número absoluto da tentativa está no payload, então o degrau reaberto é o mesmo.
- Idempotência por `(profile_user_id, event_id, channel)` fica inalterada.

Nenhuma mudança em `stripe-webhook`, `webhook-asaas` ou `execute-scheduled-tasks`: todos já delegam a decisão ao helper e já passam `invoice_id`/`payment_id`.

Ao final, atualizar a memória `mem/features/recovery/dunning-whatsapp.md` com a nova cadência, o novo teto e o escopo por ciclo.

## Verificação

- Consultar `dunning_attempts` e conferir que, num mesmo `invoice_id`/`payment_id`, as duas primeiras tentativas gravam `template_sid = HXaf4af…` e as seguintes gravam os SIDs de oferta.
- Conferir que um novo ciclo (nova invoice / nova cobrança) volta a começar pelo aviso.
