# Ana Cristina (annacrislimagbi) — cobrança dupla no downgrade de retenção

## O que aconteceu (confirmado no Stripe e no banco)

Timeline real (horários BRT):

```text
21/08 07:23  assina Transformação mensal (cartão) com 7 dias de teste
28/08 08:25  fim do teste → fatura de ciclo R$ 79,90  (billing_reason: subscription_cycle) — PAGA
28/08 08:38  pede cancelamento por "preço" → aceita oferta Base R$ 9,90
             a troca de preço reinicia o ciclo AGORA → fatura R$ 9,90
             (billing_reason: subscription_update) — PAGA
28/08 08:41  registra cancelamento (cancellation_feedback: expensive / canceled)
28/08 09:07  cancelamento efetivado com cancel_at_period_end → acesso até 29/09
```

Ela pagou **R$ 89,80 em 13 minutos**. Não é bug de webhook nem assinatura duplicada: é uma cobrança só, na mesma assinatura (`sub_...U1gB5uJX`), que trocou de preço no mesmo dia em que o ciclo cheio acabou de ser cobrado. Hoje ela está no tier Base R$ 9,90/mês, com cancelamento agendado.

## A causa

No `cancel-subscription`, o aceite de oferta de retenção (Lite/Base) troca o item da assinatura com `billing_cycle_anchor: "now"` e `proration_behavior: "none"`. Isso foi feito de propósito, pra cobrar o novo valor na hora quando a pessoa estava inadimplente. Mas quando ela **acabou de pagar** o ciclo cheio, o mesmo código:

- descarta o período pago (nenhum crédito, porque proration é "none"), e
- emite imediatamente uma segunda fatura do valor novo.

Resultado: cobrança em cima de cobrança. Qualquer cliente que aceitar a oferta nos dias seguintes à renovação passa pelo mesmo.

## O que eu proponho fazer

**1. Acertar a conta da Ana.** Reembolsar os R$ 9,90 e converter o período já pago: como ela pagou R$ 79,90 hoje, o crédito correto é manter o acesso pago até 28/09 (já está) e devolver a segunda cobrança. Alternativa, se você preferir premiar a permanência: reembolsar R$ 70,00 (79,90 − 9,90) e deixá-la no Base pagante em vez de cancelada. Decido pela primeira se você não indicar outra.

**2. Guarda no downgrade de retenção (correção estrutural).** Antes de trocar o preço, olhar a última fatura paga da assinatura:

- Se existe período pago vigente (`subscription_cycle` paga cobrindo hoje) → trocar o preço **sem** reiniciar o ciclo: `proration_behavior: "none"`, **sem** `billing_cycle_anchor: "now"`. O novo valor passa a valer na próxima renovação, o período já pago é honrado, e nenhuma fatura nova é emitida.
- Se a assinatura está inadimplente / sem período pago (o caso que motivou o código atual) → mantém o comportamento de hoje (anchor now + cobrança imediata).

**3. Mensagem coerente com o caminho escolhido.** Quando o downgrade só valer na próxima renovação, a resposta ao cliente diz isso explicitamente ("seu mês atual já está pago; de 28/09 em diante fica R$ 9,90") em vez de sugerir cobrança imediata.

**4. Registro que faltou.** O aceite da Ana não gerou linha `downgrade_base` em `cancellation_feedback` — só os dois `canceled`. Vou verificar qual ramo do aceite não escreve o feedback e padronizar o log (`action_taken: downgrade_<tier>`, `save_tier`), senão o funil de retenção continua invisível.

## Fora de escopo

Não mexo nos valores das ofertas, na escada de degraus do dunning, nem no fluxo Woovi/Asaas nesta rodada — mas se o mesmo padrão existir no downgrade PIX, eu reporto (sem alterar) ao final.

## Detalhe técnico

- `supabase/functions/cancel-subscription/index.ts`, ramo de downgrade (~linhas 1010-1100 e os ramos equivalentes em ~1611 e ~1929): inserir a checagem de período pago via `stripe.invoices.list({ subscription, status: "paid", limit: 1 })` + `current_period_end` do item, e ramificar o `subscriptions.update`.
- O void de faturas em aberto continua como está (é o que salva o caso inadimplente).
- Reembolso da Ana via API Stripe sobre a fatura `in_...m4BpOZKa` (R$ 9,90).
- Deploy da função ao final.
