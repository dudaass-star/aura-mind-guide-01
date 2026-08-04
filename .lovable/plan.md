# Nathalia (Nathy) — por que ela "não consegue ativar"

## O que os dados mostram (confirmado agora)

- Cliente desde 27/05, plano **Direção mensal (R$49,90)**, cartão Stripe (`sub_1TbsXi...`).
- A assinatura hoje está **`past_due`**. A fatura de agosto (`in_1U0WxN...`) está **`open`**, R$49,90 não pagos.
- A cobrança de 03/08 às 22:36 BRT foi **recusada pelo banco**: `card_declined` / `insufficient_funds` ("Your card has insufficient funds"), cartão Visa •0406 via Google Pay.
- Mesmo padrão em julho: falhou 04/07 e 06/07, pagou em 07/07.
- Nós avisamos: e-mail de dunning às 23:16 BRT de 03/08 e **WhatsApp de dunning às 08:00 BRT de 04/08** com a oferta de 30% off (`olaaura.com.br/cancelar?t=...&offer=discount_30`). Ela escreveu "Não estou conseguindo ativar" às 08:33 — 33 min depois desse WhatsApp.
- `retention_events` e `cancellation_feedback` estão vazios pra ela: **ela não concluiu nenhuma ação na página de oferta**.

**Causa raiz:** não é bug de ativação — é o cartão dela sem saldo. O que é falha nossa é o caminho de saída: o que ela recebeu não a leva a trocar o cartão nem a pagar a fatura pendente.

## Falhas nossas no caminho de recuperação

1. **A oferta de 30% não desbloqueia o acesso.** Em `cancel-subscription`, `apply_discount_3m` só cria o cupom e aplica na assinatura. A fatura em aberto continua aberta com o mesmo cartão sem saldo — ela "aceita a oferta" e nada ativa.
2. **Não existe ação "trocar cartão / pagar agora" nesse fluxo.** O link do WhatsApp leva à página de retenção, não a um lugar onde ela quita a fatura. O link de portal Stripe só existe no e-mail (e sessões de portal expiram rápido).
3. **O caso é "sem saldo", não "preço alto".** Para `insufficient_funds` / `card_declined`, o primeiro degrau deveria ser retomar o pagamento (outro cartão ou PIX), não desconto.

## Correções propostas

**A. Atendimento imediato da Nathy (sem código)**
- Responder que a cobrança de 03/08 foi recusada pelo banco por saldo insuficiente, com link direto para atualizar forma de pagamento / pagar a fatura em aberto.
- Se ela preferir PIX, oferecer o caminho PIX; se o motivo real for valor, então sim oferecer os 30%.

**B. Fatura em aberto resolvida junto com a oferta**
- Em `cancel-subscription`, ao aplicar desconto ou downgrade numa assinatura `past_due`: localizar a fatura `open` do ciclo, aplicar o desconto nela e tentar o pagamento; se falhar, devolver o link de pagamento da fatura na resposta.
- A mensagem de sucesso deixa de prometer ativação enquanto a fatura seguir aberta.

**C. "Atualizar forma de pagamento" no fluxo de dunning**
- Adicionar em `/cancelar` (e em `/pagamento`) uma ação primária de retomar pagamento, com link gerado na hora (não link pré-gerado que expira).
- No primeiro contato de dunning, quando o motivo do Stripe for `insufficient_funds`/`card_declined`, priorizar "retomar pagamento" e deixar o desconto como segunda opção.

**D. Observabilidade**
- Gravar o `failure_code`/`decline_code` do Stripe em `dunning_attempts`, para separar "sem saldo" de "cartão inválido" e medir o que cada degrau resolve.

## Detalhes técnicos

- Recusa: `ch_3U0XtkQU15XnZ7Vv...` → `outcome.reason = insufficient_funds`, `network_decline_code 51`, `advice_code try_again_later`.
- Fatura em aberto: `in_1U0WxNQU15XnZ7VvaOOSMot3` (`status: open`, `next_payment_attempt` agendado, `hosted_invoice_url` disponível).
- Código a mexer: `supabase/functions/cancel-subscription/index.ts` (blocos `apply_discount_3m`, `downgrade_to_*`), `supabase/functions/_shared/dunning-whatsapp.ts` (escolha do degrau e link), `src/pages/CancelSubscription.tsx` e `src/pages/Pagamento.tsx`.
- Observação à parte, não relacionada ao bloqueio: o perfil dela segue com `status = 'trial'` desde maio apesar de pagamentos aprovados em junho e julho — vale investigar em passo próprio se isso afeta limites/entitlements.