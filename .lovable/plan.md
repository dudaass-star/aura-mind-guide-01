# Nathalia (Nathy) — diagnóstico e correção do caminho de pagamento

## Diagnóstico (confirmado no banco e no Stripe)

- Cliente desde 27/05, plano Direção mensal (R$49,90), cartão Stripe (`sub_1TbsXi...`).
- Assinatura em `past_due`. Fatura de agosto (`in_1U0WxN...`) está `open`.
- A cobrança de 03/08 22:36 BRT foi recusada pelo banco: `insufficient_funds`, Visa •0406 via Google Pay.
- Recebeu e-mail de dunning 23:16 BRT (03/08) e WhatsApp de dunning 08:00 BRT (04/08) com oferta de 30%. Escreveu "Não estou conseguindo ativar" às 08:33.
- `retention_events` e `cancellation_feedback` vazios: ela não concluiu nada na página de oferta.

Não é bug de ativação: o cartão dela não tem saldo. O problema nosso é que nenhuma das mensagens leva a um lugar onde ela paga a fatura em aberto com outro meio de pagamento.

## Correções (3 mudanças, todas determinísticas)

**1. O link de dunning leva direto à fatura do Stripe.**
Em `customer-portal`, quando existe fatura `open` no Stripe, o link retornado é o `hosted_invoice_url` dessa fatura. Essa página do Stripe aceita cartão novo e paga a fatura pendente na hora. Só quando não existe fatura aberta é que o link é o Billing Portal (troca de meio de pagamento). Isso vale para `/pagamento?t=` (WhatsApp e e-mail).

**2. A oferta de retenção só é oferecida quando o motivo é preço.**
No dunning por `insufficient_funds` / `card_declined`, o primeiro contato passa a ser o template de retomada de pagamento (link da fatura), e a escada de ofertas começa a partir do segundo contato. Isso é decidido pelo `decline_code` que o Stripe já envia no evento.

**3. Aceitar desconto passa a quitar o ciclo em aberto.**
Em `cancel-subscription`, ao aplicar `apply_discount_3m` numa assinatura `past_due`: a fatura `open` do ciclo é anulada (`voidInvoice`) e a assinatura é reancorada com `billing_cycle_anchor: "now"` — mesmo mecanismo já usado nos downgrades Lite/Base. A resposta devolve o estado real: assinatura `active` → confirmação de reativação; assinatura ainda `past_due` → a resposta traz o `hosted_invoice_url` da nova fatura e a tela mostra o botão de pagar. Sem mensagem de "pronto" quando há valor em aberto.

## Atendimento da Nathy agora (sem código)

Responder no ticket que a cobrança de 03/08 foi recusada pelo banco por saldo insuficiente e enviar o `hosted_invoice_url` da fatura de agosto, onde ela paga com outro cartão. O desconto de 30% só entra se ela disser que o motivo é o valor.

## Detalhes técnicos

- Recusa: `ch_3U0XtkQU15XnZ7Vv...` → `outcome.reason = insufficient_funds`, `network_decline_code 51`.
- Fatura: `in_1U0WxNQU15XnZ7VvaOOSMot3`, `status: open`, `hosted_invoice_url` disponível.
- Arquivos: `supabase/functions/customer-portal/index.ts` (item 1), `supabase/functions/_shared/dunning-whatsapp.ts` + `supabase/functions/stripe-webhook/index.ts` (item 2), `supabase/functions/cancel-subscription/index.ts` + `src/pages/CancelSubscription.tsx` (item 3).
- Fora deste plano: o perfil dela está com `status = 'trial'` desde maio apesar dos pagamentos de junho e julho. É um segundo assunto, tratado depois.