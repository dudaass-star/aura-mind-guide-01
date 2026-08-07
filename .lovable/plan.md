# Dunning: diagnóstico do WhatsApp e do e-mail

Justo o toque — o diagnóstico anterior ficou pendendo pro e-mail. Refiz olhando canal por canal. O WhatsApp é onde estão as perdas maiores.

## Placar dos últimos 30 dias

| Canal | Registros | Entregues |
|---|---|---|
| WhatsApp (dunning) | 96 | 35 |
| E-mail (`dunning-payment-failed`) | 82 | 57 |
| Win-back pós-cancelamento (WhatsApp) | 0 | 0 |

Cadência no WhatsApp já está correta desde ~05/08: aviso 1 → aviso 2 → 30% off → Lite, com os ContentSids certos (verifiquei os registros de 05, 06 e 07/08). Os registros antigos com oferta na tentativa 1 e `limite 2` são de antes da correção de 2 avisos — não voltam a acontecer.

## Falha 1 — Win-back pós-cancelamento nunca disparou (WhatsApp)

Existe a função `winback-canceled-users` (D+3 / D+14 / D+30, template `aura_reconnect_v2`). No banco: **32 perfis cancelados, 30 com data de cancelamento, e zero win-back enviado — nenhum, nunca.** As três colunas de controle estão todas vazias.

Ou seja: quem cancela ou cai por falta de pagamento sai do radar do WhatsApp por completo. O degrau Base (R$ 9,90) só existe na página `/cancelar`, e ninguém é levado até lá.

Correção: descobrir por que o cron não roda (agendamento ausente ou gate interno bloqueando), rodar em modo seco pra ver quantos elegíveis existem hoje, e ligar de fato. Sem isso, os outros ajustes rendem pouco.

## Falha 2 — Sem perfil = nenhum canal fala (44 casos em 14 dias)

Quando o telefone do gateway não casa com nenhum perfil, o webhook aborta antes de tudo. Não sai WhatsApp **e** não sai e-mail — apesar de o telefone e o e-mail estarem ali, na mão, vindos do gateway.

Caso real confirmado no Stripe: cliente do Direção (R$ 49,90) acumulou 8 falhas e teve a assinatura cancelada por falta de pagamento **sem receber uma única mensagem em nenhum canal**. Ao menos 12 clientes distintos assim em 3 semanas.

Correção nos dois canais:
- **WhatsApp**: usar o telefone que veio do gateway e enviar o aviso utility pelo número de recuperação, com link curto do portal de cobrança no lugar do link de portal do usuário (que depende de perfil).
- **E-mail**: enviar o `dunning-payment-failed` com o e-mail do gateway.

## Falha 3 — Falha de entrega no WhatsApp não tem plano B (3 casos)

A Twilio aceita o envio e depois o callback marca `failed` (ErrorCode 63027). Hoje isso só vira linha de log: o degrau não é reenviado no mesmo ciclo e nenhum outro canal cobre a lacuna.

Correção: quando o callback marcar falha de entrega, disparar o e-mail equivalente daquele degrau e reagendar uma tentativa de WhatsApp no dia seguinte, dentro da janela permitida.

## Falha 4 — renovação de cliente ativo descartada (19 casos)

Aqui não tem nada a ver com carrinho abandonado — me expressei mal antes. Fui conferir uma a uma: são **19 faturas de renovação de assinantes ativos** em 30 dias que o webhook descartou com o motivo `no_subscription_on_invoice`.

Exemplo real conferido no Stripe agora: fatura `in_1TwiP0…`, cliente do **Transformação R$ 79,90**, motivo da cobrança `subscription_cycle` (renovação de mês), assinatura `sub_1TY3ym…` viva, **9 tentativas de cobrança falhadas**, fatura ainda aberta e não paga. Nenhum aviso saiu — nem WhatsApp, nem e-mail — porque o código não conseguiu ler a assinatura dentro da fatura e abortou.

A causa é técnica: o Stripe mudou o formato e agora a assinatura vem em `parent.subscription_details.subscription`, não mais no campo `subscription` que o código lê. Toda renovação que falha cai nesse buraco.

A correção é só ler o campo novo antes de desistir. O fluxo de carrinho abandonado continua separado e intocado — ele trata quem nunca virou assinante; este trata quem já é cliente e falhou na renovação. Não há mistura entre os dois.

## Falha 5 — `offer_tier` nunca é gravado (auditoria cega)

280 tentativas, zero com o degrau registrado. Sem isso não há como responder "quantos receberam a oferta de 30%?" nem medir aceite por degrau no WhatsApp. Gravar `offer_tier` e `days_past_due` em todos os registros.

## Escopo técnico

- `supabase/functions/winback-canceled-users/index.ts` + agendamento: investigar a não execução, rodar em dry-run e ativar o cron diário 10h BRT.
- `supabase/functions/_shared/dunning-whatsapp.ts`: aceitar telefone e nome vindos do gateway quando não houver perfil (link = portal de cobrança, sem token de usuário); persistir `offer_tier` e `days_past_due`.
- `supabase/functions/stripe-webhook/index.ts` e `webhook-asaas/index.ts`: nos ramos `profile_not_found` e `no_subscription_on_invoice` (renovação), seguir para WhatsApp + e-mail em modo degradado, com `error_stage` próprio para auditoria.
- `supabase/functions/webhook-twilio-recovery/index.ts`: ao marcar falha de entrega, acionar e-mail equivalente e reagendar o degrau.
- `src/pages/AdminEngagement.tsx`: distribuição por degrau (aviso 1, aviso 2, 30%, Lite), linhas separadas para "sem perfil", "falha de entrega" e "win-back enviados".

## Fora de escopo

Valores das ofertas, templates aprovados, janela 08h–21h BRT e a cadência PIX (D0/D+2/D+4) ficam como estão.
