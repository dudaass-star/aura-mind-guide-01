---
name: mit-mandate-reinforcement
description: Reforços CIT→MIT na 1ª cobrança para reduzir bloqueio bancário em renovações sem fricção
type: technical
---
Para reduzir `do_not_honor` em renovações sem ativar 3DS off-session, a 1ª cobrança do plano semanal (`create-checkout`) declara o mandato MIT via 2 sinais válidos no Brasil:

1. **`payment_intent_data.setup_future_usage: 'off_session'`**: ESTE é o reforço MIT real. Estabelece o mandato off-session reusável; o PaymentMethod salvo é cobrado pela Subscription criada no webhook como continuidade autorizada (não tentativa órfã).
2. **`payment_intent_data.statement_descriptor_suffix: 'SEMANAL'`**: padrão estável "AURA*" na fatura é sinal forte de legitimidade pros antifraudes dos bancos BR (Itaú, Bradesco, Nubank). Renovações herdam o descriptor base "AURA" da conta Stripe.

⛔ **NÃO USAR `payment_method_options.card.mandate_options`**: o Stripe rejeita esse parâmetro em modo `payment` com cartão fora da Índia ("Received unknown parameter"). Quebrou 100% dos checkouts em 2026-04-26 — removido. É exclusivo de SetupIntents ou métodos India card / AU BECS.

A Subscription criada no webhook herda `payment_settings.payment_method_types: ['card']` + `save_default_payment_method: 'on_subscription'`. O `payment_intent_data.metadata.mandate_reference: aura-{customerId}` permanece para audit trail.
