---
name: Reconciliação PIX Bacen avulso via customer
description: webhook-asaas ativa PAYMENT_RECEIVED sem subscription se existe asaas_pix_authorizations ACTIVE do mesmo customer e valor bate (tolerância R$ 0,50)
type: feature
---

Contexto: no PIX Automático Bacen o Asaas provisiona a 1ª fatura do ciclo com QR próprio. Se o cliente paga via outra chave/QR do mesmo recebedor (comum: chave PIX solta, valor arredondado, QR antigo), o Asaas cria uma **cobrança avulsa** com `subscription=null`, `pixAutomaticAuthorizationId=null`, apenas `customer` preenchido. Sem esse fallback, o pagamento é abandonado silenciosamente e o cliente nunca é ativado (bug histórico Juscileia Da Silva Sousa, 02/07/2026 — `pay_agb0ew05o93qdflp`).

Regra de negócio (`supabase/functions/webhook-asaas/index.ts`, bloco após linha ~328, antes do warning final): quando os 4 fallbacks anteriores falharem E `isPaid=true` E existir `asaas_pix_authorizations` com `status='ACTIVE'` para o mesmo `asaas_customer_id`, cria a linha em `asaas_payments` herdando dados da autorização e ativa via `handleActivation`. Requer `Math.abs(paymentValue - value_cents/100) <= 0.5` — protege contra ativação por PIX aleatório de outro contexto no mesmo customer.

O warning final (linha ~332) foi promovido a `console.error` sempre que `isPaid && !updated` — pagamento confirmado sem vinculação é sinal grave, não ruído. Idempotência garantida por `UNIQUE (asaas_payment_id)`.