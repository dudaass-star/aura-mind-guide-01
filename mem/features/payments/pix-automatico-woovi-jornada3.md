# PIX Automático via Woovi — Jornada 3 (scan único)

## Por que a Woovi entrou
O Inter só implementa a **Jornada 2**: pagamento e autorização do mandato são
dois passos separados, então a promo "1ª semana R$ 6,90 + mensal cheio" ficava
impossível num único QR (lá o trial virou **7 dias grátis**, `inter_trial_mode`).
A Woovi implementa a **Jornada 3 (`PAYMENT_ON_APPROVAL`)**: um único BR Code
cobra o valor de entrada E autoriza os débitos futuros no mesmo scan — a UX que
o Asaas tinha (Jornada 1) antes de quebrar com 401 em produção.

## Como está montado
- `_shared/woovi.ts` — client (auth = `WOOVI_APP_ID` no header `Authorization`),
  base `https://api.woovi.com`, `brtDate`, mapa de frequências.
- `criar-pix-recorrente-woovi` — `POST /api/v1/subscriptions` com
  `type: PIX_RECURRING`, `pixRecurringOptions: { journey: PAYMENT_ON_APPROVAL,
  retryPolicy: THREE_RETRIES_7_DAYS, minimumValue }`, `dayGenerateCharge = hoje`.
  O QR composto vem em `subscription.pixRecurring.emv` (validado: contém
  `/qr/v2/cob/` **e** `/qr/v2/rec/` no mesmo payload). A imagem é gerada local
  em SVG (a Woovi só devolve o EMV).
- `webhook-woovi` — mandato (`PIX_AUTOMATIC_APPROVED/REJECTED`) e cobrança
  (`OPENPIX:CHARGE_COMPLETED`, `PIX_AUTOMATIC_COBR_*`). Acesso só é liberado com
  dinheiro entrando, com confirmação via `GET /api/v1/charge/{correlationID}`.
- Tabelas: `woovi_subscriptions`, `woovi_charges`, `woovi_webhook_events`
  (claim reentrante por `event_key`, igual ao Inter).

## Promo de entrada (valor variável)
O mandato nasce com `value` = valor promocional (R$ 6,90 essencial) e
`minimumValue` igual. Ao receber `PIX_AUTOMATIC_APPROVED`, o webhook chama
`PUT /api/v1/subscriptions/{id}/value` com o preço cheio, então os ciclos
seguintes cobram o mensal normal **sem nova autorização** (mandato de valor
variável — o teto quem define é o cliente no app do banco).
Se esse PUT falhar, fica registrado em `woovi_subscriptions.last_error`
("valor cheio não aplicado") — é um caso a monitorar, porque significa ciclo
cobrando o promocional.

## Ligar/desligar
`system_config.pix_gateway` = `woovi` | `inter` | `asaas`. O CheckoutV2 lê essa
chave e escolhe a edge function. Promo só em `monthly`, só cliente novo
(`isReturningCustomer` cobre perfil, Woovi, Inter, Asaas e Stripe).

## Webhooks registrados na Woovi
Um por evento (a API não aceita evento vazio/curinga), todos apontando para
`/functions/v1/webhook-woovi`: `OPENPIX:CHARGE_COMPLETED`,
`PIX_AUTOMATIC_APPROVED`, `PIX_AUTOMATIC_REJECTED`,
`PIX_AUTOMATIC_COBR_COMPLETED`, `PIX_AUTOMATIC_COBR_REJECTED`,
`PIX_AUTOMATIC_COBR_TRY_REJECTED`.

## Pegadinha
A API exige `customer.address`. O checkout da Aura não pede endereço e o Bacen
não exibe endereço no mandato, então enviamos o endereço da empresa como
placeholder em `criar-pix-recorrente-woovi`.
