# Eduardo pagou R$ 29,90 e não foi ativado — correção + rede de segurança

## O que aconteceu (verificado)

Cliente: Eduardo, `eduardoapparecidojr@gmail.com`, +55 12 97401-3440.

1. 02/08 11:07 — abriu checkout no cartão (plano semanal R$ 6,90). Essa sessão Stripe **expirou sem pagamento** (`status: expired`, `payment_status: unpaid`). Não existe nenhuma cobrança dele no Stripe.
2. 02/08 11:31 — voltou e fechou por **PIX Automático (Bacen)**, plano Essencial mensal R$ 29,90. A autorização foi criada e ficou `ACTIVE` às 11:32.
3. 02/08 — ele **pagou de fato R$ 29,90**. No Asaas existe a cobrança `pay_0ibxcnle80mcyiku`, status `RECEIVED`, `paymentDate 2026-08-02`, descrição "Cobrança gerada automaticamente a partir de Pix recebido" (PIX solto, fora do QR da fatura da assinatura).
4. Essa cobrança **não existe na nossa base**: `asaas_payments` só tem as duas faturas gêmeas `PENDING` (`pay_uudjglvya6syaebj`, `pay_b2hxdph6osgiz9gr`). Sem linha paga, não rodou a ativação: **não há `profiles`, nem token do portal, nem WhatsApp de boas-vindas, nem e-mail de confirmação**.
5. Pior: ele entrou no fluxo de carrinho abandonado (recuperação por e-mail em 02/08 e WhatsApp em 03/08) — sendo cliente pagante.
6. 03/08 13:19 — a autorização Bacen foi **cancelada** (a assinatura `sub_tca2rgb0ht3wan8x` segue `ACTIVE` no Asaas, próximo vencimento 02/10, mas sem consentimento ativo não haverá débito automático).

Causa raiz: a cobrança avulsa gerada pelo Asaas a partir do PIX recebido não chegou (ou não foi processada) como evento no nosso webhook, e a auditoria diária só olha autorizações/faturas conhecidas — nunca compara com os pagamentos `RECEIVED` que existem no Asaas e não existem na nossa base.

## Ação imediata (caso Eduardo)

1. Registrar `pay_0ibxcnle80mcyiku` em `asaas_payments` (vinculado à autorização/assinatura dele) e rodar a ativação: perfil `active`, `plan_expires_at` = 02/09, token do portal, WhatsApp de boas-vindas e e-mail de confirmação.
2. Cancelar/limpar as duas faturas gêmeas `PENDING` para ele não receber cobrança repetida.
3. Encerrar o fluxo de recuperação (marcar o checkout como concluído) para parar mensagens de carrinho abandonado.
4. Sobre a renovação: como o consentimento Bacen foi cancelado em 03/08, o próximo ciclo não debita sozinho. Ele fica com acesso pago até 02/09 e recebe, antes do vencimento, um link para reautorizar o PIX Automático (ou pagar no cartão).

## Correções de código

1. **Reconciliação ativa na auditoria** (`asaas-pix-auto-audit`): passar a consultar no Asaas os pagamentos `RECEIVED`/`CONFIRMED` dos últimos 5 dias e, para cada um que não existir em `asaas_payments`, criar a linha e disparar a ativação (mesma lógica do webhook). Isso cobre qualquer webhook perdido, não só PIX Automático.
2. **Fallback por customer menos restritivo** (`webhook-asaas`): hoje a reconciliação por customer exige autorização `status = 'ACTIVE'`. Passar a aceitar autorização recente do mesmo customer em qualquer status (ACTIVE, CANCELLED, EXPIRED), mantendo a tolerância de valor de R$ 0,50 e uma janela de tempo (ex.: 30 dias). Pagamento confirmado nunca deve ser descartado por causa do estado do consentimento.
3. **Não recuperar quem pagou**: antes de disparar recuperação de checkout (e-mail e WhatsApp), checar se existe pagamento pago no Asaas/Stripe para o mesmo e-mail ou telefone; se existir, encerrar a sessão de checkout em vez de cobrar.
4. **Alerta operacional**: quando a auditoria encontrar pagamento pago sem vínculo, além de reconciliar, enviar alerta ao admin com nome, e-mail e id da cobrança.

## Detalhes técnicos

- Arquivos: `supabase/functions/webhook-asaas/index.ts` (bloco de fallback por customer, ~linha 372), `supabase/functions/asaas-pix-auto-audit/index.ts` (novo passo de reconciliação via `GET /v3/payments?status=RECEIVED&paymentDate[ge]=...`), funções de recuperação de checkout (guarda de pagamento).
- Ativação reaproveita `handleActivation` do webhook — extrair para `_shared` se necessário para uso na auditoria.
- Idempotência garantida pelo `UNIQUE (asaas_payment_id)`.
- Ajuste de memória: registrar que a reconciliação por customer não depende de autorização `ACTIVE`.
