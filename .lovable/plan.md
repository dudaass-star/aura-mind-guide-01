# Dunning: 2 avisos antes da escada de descontos (Stripe + Asaas)

## O que muda

Hoje o primeiro WhatsApp de cobrança falhada já é a oferta de 30%. O template genérico de aviso ("atualize seu pagamento") existe, mas nunca é usado porque os 3 degraus da escada ocupam as 3 tentativas do ciclo.

Nova cadência por ciclo de cobrança, igual para todos os meios de pagamento:

| Falha no ciclo | WhatsApp | Conteúdo |
|---|---|---|
| 1ª | Aviso | template utility, link direto de pagamento |
| 2ª | Aviso | template utility, link direto de pagamento |
| 3ª | Oferta | 30% off por 3 meses |
| 4ª | Oferta | Plano Lite R$ 19,90 |
| 5ª+ | — | nada (limite do ciclo) |

O e-mail de falha de pagamento continua como está (todo evento de falha, com link de retomada).

O degrau "Base R$ 9,90" sai do WhatsApp e permanece só dentro da página /cancelar, como já definido antes.

## Onde vale

O ponto de decisão é um único helper compartilhado, então a mesma cadência passa a valer automaticamente em:

- **Stripe (cartão)** — cada `invoice.payment_failed` das Smart Retries conta uma falha.
- **Asaas (cartão)** — cada retentativa de cobrança falhada conta uma falha.
- **Asaas (PIX recorrente)** — cada `PAYMENT_OVERDUE` do ciclo conta uma falha.

A contagem é por assinatura (ou por cobrança, quando não há assinatura), então o cliente que falha no cartão e depois no PIX não recomeça a escada do zero.

## Detalhes técnicos

`supabase/functions/_shared/dunning-whatsapp.ts`:

- Introduzir `DUNNING_NOTICE_STEPS = 2`. Tentativas 1 e 2 usam `DUNNING_CONTENT_SID` (utility, sem janela de horário, `{{2}}` = URL completa `/pagamento?t=<token>`).
- A escada passa a ser indexada por `attemptNumber - DUNNING_NOTICE_STEPS`, com dois degraus: `discount_30` e `lite`. `base` é removido do array.
- `DUNNING_MAX_ATTEMPTS` = 4 (2 avisos + 2 ofertas).
- A contagem de tentativas hoje filtra `template_sid in LADDER_SIDS`, o que ignora os avisos. Passa a contar todos os envios com `whatsapp_sent = true` no escopo (aviso + oferta), incluindo `DUNNING_CONTENT_SID`, para que os avisos consumam os dois primeiros degraus.
- Janela de marketing 08h–21h BRT continua aplicada só aos degraus de oferta; avisos utility disparam a qualquer hora (respeitando o resto da governança de envio).
- `forceAttemptNumber` (tarefa adiada em `execute-scheduled-tasks`) continua funcionando: o número absoluto da tentativa é preservado no payload, então o degrau reaberto é o mesmo.

Nenhuma mudança necessária em `stripe-webhook`, `webhook-asaas` ou `execute-scheduled-tasks` — todos já delegam a decisão ao helper.

## Verificação

- Consultar `dunning_attempts` após o deploy e confirmar que as duas primeiras tentativas de cada ciclo gravam `template_sid = HXaf4af…` e as seguintes gravam os SIDs de oferta.
- Conferir que ciclos já em andamento não reenviam ofertas além do novo limite de 4.
