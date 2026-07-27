## Objetivo

Fechar o degrau 3 da escada de dunning (SID recebido) e cobrir o buraco do **cartão Asaas**, que hoje só recebe a primeira oferta.

## Estado atual (verificado no código)

- `_shared/dunning-whatsapp.ts`: degrau 3 (`base`) está com `sid: null` → cai no template genérico.
- `webhook-asaas`: chama `sendDunningWhatsApp` em todo `PAYMENT_OVERDUE`, sem filtrar meio de pagamento. Cartão Asaas **recebe** o degrau 1.
- Logo em seguida, para `CREDIT_CARD_RECURRING`, agenda retries próprios em D+2/D+4/D+7 (`card_retry_asaas`).
- `execute-scheduled-tasks`, case `card_retry_asaas`: quando o retry falha, apenas loga; na última tentativa cancela a assinatura. **Não dispara dunning**. Logo, degraus Lite e Base dependem de um novo `PAYMENT_OVERDUE` do Asaas, que não é garantido nesses recharges.
- Stripe: cada Smart Retry reemite `invoice.payment_failed` → escada avança sozinha.
- Não existe intervalo mínimo próprio entre degraus; o ritmo é ditado pelo provedor, com o único ajuste sendo adiar para 08h BRT quando cai fora da janela 08h–21h.

## O que será feito

**1. Ligar o degrau 3**
- Atualizar `whatsapp_templates`: `dunning_offer_base` → `HX65a53c5b0bb1dd7868146ee118c125fb`, `is_active = true`.
- Preencher o `sid` do tier `base` em `DUNNING_OFFER_LADDER`.

**2. Cobrir o cartão Asaas na escada**
- No case `card_retry_asaas` de `execute-scheduled-tasks`, quando o recharge falhar, chamar `sendDunningWhatsApp` com `eventId = asaas-cardretry-<paymentId>-<attempt>` (dedup natural por tentativa), `provider: "asaas"`, `paymentId` e `subscriptionId` já disponíveis no payload.
- O `attemptNumber` continua sendo calculado pelo próprio helper (contagem de envios com `message_sid` no mesmo `subscription_id`), então retry 1 → Lite, retry 2 → Base, retry 3 → limite atingido.
- Resolver `user_id`/`phone`/`name` pelo mesmo caminho já usado no webhook (via `asaas_payments` → `profiles`).

**3. Ritmo entre degraus**
Com isso, o cartão Asaas fica com espaçamento explícito D0 → D+2 → D+4 (D+7 já bate o teto de 3 envios). Nenhum intervalo artificial é adicionado ao Stripe/PIX.

**4. Deploy e memória**
- Deploy: `execute-scheduled-tasks`, `webhook-asaas`, `stripe-webhook`.
- Atualizar `mem/features/recovery/dunning-whatsapp.md` com o SID real e o novo gatilho de cartão Asaas.

## Verificação

- Consulta em `whatsapp_templates` confirmando os 3 SIDs ativos.
- Conferência de que a 3ª tentativa resolve para `HX65a53c5b0bb1dd7868146ee118c125fb`.
- Checagem de `dunning_attempts` filtrando `provider = 'asaas'` para ver se aparecem múltiplos `attempt_number` por assinatura de cartão.

## Ponto a decidir

Se quiser um intervalo mínimo global entre degraus (ex.: 48h) também para Stripe/PIX, me diz que incluo — hoje, se o provedor reprocessar duas falhas no mesmo dia, dois degraus podem sair com poucas horas de diferença.
