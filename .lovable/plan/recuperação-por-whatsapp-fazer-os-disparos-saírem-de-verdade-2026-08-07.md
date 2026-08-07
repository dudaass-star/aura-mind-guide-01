# Recuperação por WhatsApp: fazer os disparos saírem de verdade

O fluxo existe e a escada de ofertas está certa. O que está quebrado é o disparo: na maior parte dos casos a mensagem nunca chega a ser enviada. Foco total no WhatsApp; e-mail entra só como rede de segurança.

## Diagnóstico do WhatsApp (últimos 30 dias)

96 tentativas de dunning por WhatsApp, **35 entregues**. E, além dessas, três grupos de clientes onde nem tentativa existiu:

| Bloqueio | Casos | O que acontece |
|---|---|---|
| Win-back pós-cancelamento nunca rodou | 30 cancelados, 0 disparos | Quem cancela nunca é chamado de volta |
| Renovação de assinante ativo descartada | 19 faturas | Cliente que já paga falha e não recebe nada |
| Cliente sem perfil no banco | 44 casos | Webhook aborta antes de montar a mensagem |
| Twilio marcou como não entregue | 3 casos | Degrau se perde, nada cobre |

O que já está correto e não muda: a cadência aviso 1 → aviso 2 → 30% off → Lite (verificada nos envios de 05, 06 e 07/08), os templates aprovados, a janela 08h–21h BRT para ofertas e a cadência PIX D0/D+2/D+4.

---

## Correção 1 — Ligar o win-back pós-cancelamento (maior volume parado)

A rotina `winback-canceled-users` existe, com D+3 / D+14 / D+30 e o template aprovado `aura_reconnect_v2`. No banco: 32 perfis cancelados, 30 com data de cancelamento e **nenhum** win-back registrado — as três colunas de controle estão vazias desde sempre. Nunca rodou uma vez.

Hoje o degrau Base de R$ 9,90 só existe dentro da página `/cancelar`, e sem o WhatsApp ninguém é levado até lá.

Ações: achar por que não executa (agendamento ausente ou trava interna), rodar em modo seco para contar elegíveis, ligar o cron diário 10h BRT e conferir o primeiro lote real chegando.

## Correção 2 — Destravar a renovação de assinante ativo

19 faturas de renovação foram descartadas pelo webhook antes de qualquer disparo.

Caso conferido no Stripe: cliente do **Transformação R$ 79,90**, fatura `in_1TwiP0…`, cobrança de ciclo mensal, assinatura ativa, **9 tentativas de cobrança falhadas**, fatura aberta. Zero mensagens.

Causa: o Stripe passou a entregar a assinatura em `parent.subscription_details.subscription`; o código lê o campo antigo `subscription`, não encontra e encerra. Basta ler o campo novo como alternativa. Não tem relação com carrinho abandonado — esse fluxo continua separado e intocado.

## Correção 3 — Falar com quem não tem perfil no banco

Quando o telefone do gateway não casa com nenhum perfil, o webhook aborta antes de montar o WhatsApp. 44 ocorrências em 14 dias, pelo menos 12 clientes distintos — um deles do Direção R$ 49,90 acumulou 8 falhas e foi cancelado sem receber nada.

Ação: enviar o aviso pelo telefone que veio do gateway, usando link curto do portal de cobrança (que não depende de token de usuário). É disparo de WhatsApp real, não substituição por e-mail.

## Correção 4 — Cobrir a não entrega da Twilio

A Twilio aceita o envio e depois informa que não entregou (erro 63027). Hoje isso só vira log: o degrau não é reenviado e a escada anda para frente sem que o cliente tenha lido nada.

Ação: ao receber a não entrega, não queimar o degrau — reagendar a tentativa de WhatsApp para o dia seguinte dentro da janela e disparar o e-mail equivalente em paralelo.

## E-mail (secundário)

O e-mail hoje roda em paralelo e depende do mesmo ponto de aborto dos casos 2 e 3. As correções acima já o destravam junto; nada específico de e-mail além de garantir que ele saia quando o WhatsApp não entregar.

## Teste antes de considerar pronto

1. Modo seco do win-back mostrando a lista de elegíveis com o degrau de cada um.
2. Disparo real para um número de teste em cada um dos quatro degraus, confirmando template e link.
3. Reprocessar as 19 faturas de renovação e as 44 ocorrências sem perfil e conferir mensagem por mensagem no registro.
4. Simular a não entrega da Twilio e confirmar reagendamento + e-mail.
5. Revisar o painel: cada degrau com contagem, e as linhas "sem perfil", "não entregue" e "win-back enviados" saindo do zero.

## Escopo técnico

- `winback-canceled-users` + agendamento: investigação, dry-run, cron diário 10h BRT.
- `stripe-webhook/index.ts`: fallback para `parent.subscription_details.subscription`; no ramo sem perfil, seguir com o telefone do gateway.
- `webhook-asaas/index.ts`: mesmo tratamento do ramo sem perfil.
- `_shared/dunning-whatsapp.ts`: aceitar telefone/nome do gateway sem perfil; link do portal de cobrança; gravar `offer_tier` e `days_past_due` (hoje 280 tentativas sem nenhum degrau registrado — auditoria cega).
- `webhook-twilio-recovery/index.ts`: não entrega passa a reagendar o degrau e acionar o e-mail.
- `src/pages/AdminEngagement.tsx`: distribuição por degrau e as três linhas novas de diagnóstico.

## Fora de escopo

Valores das ofertas, templates aprovados, janela 08h–21h BRT, cadência PIX e o fluxo de carrinho abandonado.
