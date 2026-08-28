# Ana Cristina — escopo reduzido: mensagem do downgrade + registro do aceite

## Contexto (já confirmado no Stripe e no banco)

Timeline real (BRT): 21/08 assina Transformação mensal com 7 dias de teste → 28/08 08:25 fatura de ciclo R$ 79,90 paga → 08:38 aceita a oferta de retenção Base R$ 9,90 e o Stripe emite fatura imediata de R$ 9,90 → 08:41 e 09:07 registra cancelamento (`cancellation_feedback: expensive / canceled`), assinatura hoje em Base R$ 9,90 com `cancel_at_period_end` até 29/09.

Você definiu o escopo desta rodada: **só os itens 3 e 4**. Sem reembolso e sem mexer no comportamento de cobrança do downgrade.

## 1. Mensagem coerente no aceite da oferta (item 3)

Hoje, quando a pessoa aceita Lite/Base, a resposta fala como se o novo valor simplesmente passasse a valer, sem dizer o que acontece com o mês que ela acabou de pagar. Foi exatamente o que aconteceu com a Ana: pagou R$ 79,90 às 08:25 e viu R$ 9,90 às 08:38 sem nenhuma explicação.

O que muda: a mensagem de confirmação passa a declarar o efeito financeiro real.

- Quando existe ciclo pago vigente (fatura de ciclo paga cobrindo hoje): "seu mês atual já está pago e segue valendo; a cobrança de R$ 9,90 abre o novo ciclo a partir de hoje" — dizendo, em uma linha, que houve uma cobrança agora.
- Quando não há ciclo pago (o caso inadimplente, que é o que motivou o desenho atual): mantém o texto de hoje, "ajustei o valor e cobrei R$ 9,90 agora".

A mesma frase entra na tela de cancelamento (`CancelSubscription.tsx`) no ponto em que a oferta é apresentada, para que a pessoa saiba antes de aceitar que a troca reinicia o ciclo e gera cobrança imediata.

## 2. Registro do aceite que não foi gravado (item 4)

O aceite da Ana não gerou linha `downgrade_base` em `cancellation_feedback` — só as duas linhas `canceled`. Ou seja: o degrau de retenção que de fato foi aplicado no Stripe ficou invisível no funil.

O que faço:
- localizar qual ramo do aceite de oferta não escreve o feedback (existem três caminhos de downgrade na função, e só um deles insere a linha);
- padronizar o registro em todos: `action_taken: downgrade_<tier>`, `save_offer_accepted: true`, `save_tier`, `gateway`, além do `logRetention(tier, "accepted"/"applied")` que já existe em um dos caminhos;
- conferir depois, no banco, que um aceite passa a produzir exatamente uma linha de downgrade.

## Fora de escopo (registrado, não executado)

- Reembolso ou crédito da segunda cobrança da Ana.
- A correção estrutural do downgrade (não reiniciar o ciclo quando há período pago). Enquanto isso não for feito, quem aceitar a oferta nos dias seguintes à renovação vai continuar pagando duas vezes no mesmo mês — só passará a ser avisado disso pela mensagem nova.

## Detalhe técnico

- `supabase/functions/cancel-subscription/index.ts`: nos ramos de downgrade (~1010-1100, ~1611, ~1929) adicionar a checagem de ciclo pago (`stripe.invoices.list({ subscription, status: "paid", limit: 1 })` + comparação com o período corrente) apenas para escolher o texto de retorno, sem alterar os parâmetros do `subscriptions.update`; e uniformizar o insert em `cancellation_feedback`.
- `src/pages/CancelSubscription.tsx`: aviso curto no card da oferta sobre a cobrança imediata do novo valor.
- Deploy da edge function ao final.
