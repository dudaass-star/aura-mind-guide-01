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

**2. A escada de desconto só começa depois dos avisos de falha de pagamento.**
Hoje a ordem está invertida em relação ao que foi combinado. No **primeiro** `invoice.payment_failed`, o código dispara o e-mail com link de pagamento e, no mesmo evento, o WhatsApp já no degrau 1 da escada — que é o template de **30% off** (`DUNNING_OFFER_LADDER[0] = discount_30`). Foi isso que a Nathy recebeu às 08:00 BRT, ainda sem nenhum aviso de "sua cobrança falhou, atualize o pagamento" no WhatsApp.
Mudança: `sendDunningWhatsApp` passa a mapear a tentativa assim, tanto para Stripe (Smart Retries: 4 eventos em 3 semanas) quanto para o retry de cartão Asaas (D0 / D+2 / D+4 / D+7):

```text
falha 1  → aviso de pagamento (DUNNING_CONTENT_SID → /pagamento?t=)
falha 2  → aviso de pagamento (2º e último aviso)
falha 3  → oferta 30% off        (/cancelar?t=&offer=discount_30)
falha 4  → oferta Lite R$19,90   (/cancelar?t=&offer=lite)
```

O degrau Base (R$9,90) sai da escada automática de WhatsApp e continua disponível dentro de `/cancelar` (o cliente que recusa a Lite vê a Base na mesma tela). Constante nova `DUNNING_NOTICE_ATTEMPTS = 2`; o teto total de envios por ciclo sobe de 3 para 4 e a contagem passa a considerar avisos + ofertas, para o cliente nunca receber mais de 4 WhatsApps por ciclo de cobrança.
Os dois primeiros envios são template utility (sem janela de horário); os degraus de oferta seguem Marketing 08h–21h BRT com adiamento via `scheduled_tasks`, como já é hoje.

**3. Aceitar desconto passa a quitar o ciclo em aberto.**
Em `cancel-subscription`, ao aplicar `apply_discount_3m` numa assinatura `past_due`: a fatura `open` do ciclo é anulada (`voidInvoice`) e a assinatura é reancorada com `billing_cycle_anchor: "now"` — mesmo mecanismo já usado nos downgrades Lite/Base. A resposta devolve o estado real: assinatura `active` → confirmação de reativação; assinatura ainda `past_due` → a resposta traz o `hosted_invoice_url` da nova fatura e a tela mostra o botão de pagar. Sem mensagem de "pronto" quando há valor em aberto.

## Atendimento da Nathy agora (sem código)

Responder no ticket que a cobrança de 03/08 foi recusada pelo banco por saldo insuficiente e enviar o `hosted_invoice_url` da fatura de agosto, onde ela paga com outro cartão. O desconto de 30% só entra se ela disser que o motivo é o valor.

## Detalhes técnicos

- Recusa: `ch_3U0XtkQU15XnZ7Vv...` → `outcome.reason = insufficient_funds`, `network_decline_code 51`.
- Fatura: `in_1U0WxNQU15XnZ7VvaOOSMot3`, `status: open`, `hosted_invoice_url` disponível.
- Arquivos: `supabase/functions/customer-portal/index.ts` (item 1), `supabase/functions/_shared/dunning-whatsapp.ts` + `supabase/functions/stripe-webhook/index.ts` (item 2), `supabase/functions/cancel-subscription/index.ts` + `src/pages/CancelSubscription.tsx` (item 3).
- Fora deste plano: o perfil dela está com `status = 'trial'` desde maio apesar dos pagamentos de junho e julho. É um segundo assunto, tratado depois.