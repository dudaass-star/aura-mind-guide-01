## Diagnóstico final

Fluxo esperado do negócio (confirmado):
1. Cliente autoriza PIX Automático Bacen → `AUTHORIZATION_ACTIVATED`
2. Asaas provisiona 1ª cobrança (`pay_A`, PIX_AUTOMATIC, PENDING)
3. Cliente paga o QR **na hora**
4. Asaas confirma → sistema ativa

O que quebrou com a Juscileia (e com quem quebrou "há poucos dias"):
- Autorização Bacen ativou às 20:59 ✅
- Cobrança provisionada `pay_4c4l80yg3m035ofi` PENDING ✅
- Cliente pagou R$29,90 via PIX → Asaas creditou numa **cobrança nova** (`pay_agb0ew05o93qdflp`, RECEIVED, `customer=cus_000185008988`, `subscription=null`) em vez de fechar a fatura provisionada
- Webhook não tem caminho pra esse `payment.id` → **abandono silencioso**

Motivo Asaas-side (irrelevante pra gente resolver): a cobrança PIX_AUTOMATIC provisionada tem QR próprio do Bacen; se o cliente usa qualquer outra chave/QR do mesmo recebedor, o Asaas gera cobrança avulsa. Não vamos tentar "consertar" isso no Asaas — vamos aceitar como fato e reconciliar do nosso lado.

Regra de negócio limpa que resolve tudo: **`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` com `customer=X` + existe `asaas_pix_authorization` ACTIVE para o mesmo `customer=X` + valor bate com o plano contratado = ativa esse cliente**. É a definição do negócio, não uma gambiarra.

## Ativação da Juscileia (operação one-shot)

1. `insert` em `asaas_payments`:
```sql
INSERT INTO asaas_payments (
  asaas_payment_id, asaas_customer_id, asaas_subscription_id,
  customer_name, customer_email, customer_phone, customer_cpf,
  plan, billing_period, amount_cents, status, payment_method,
  invoice_url, paid_at, raw_payload, created_at
)
SELECT
  'pay_agb0ew05o93qdflp',
  a.asaas_customer_id,
  a.asaas_subscription_id,
  a.customer_name, a.customer_email, a.customer_phone, a.customer_cpf,
  a.plan, a.billing_period, 2990, 'RECEIVED', 'PIX_AUTOMATIC',
  'https://www.asaas.com/i/agb0ew05o93qdflp',
  now(),
  '{"id":"pay_agb0ew05o93qdflp","status":"RECEIVED","value":29.9,"customer":"cus_000185008988","reconciled_manually":true}'::jsonb,
  now()
FROM asaas_pix_authorizations a
WHERE a.asaas_customer_id = 'cus_000185008988';
```

2. `supabase--curl_edge_functions` para `POST /webhook-asaas` com body `{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_agb0ew05o93qdflp","status":"RECEIVED","value":29.9,"customer":"cus_000185008988","billingType":"PIX"}}` e `x-asaas-access-token: $ASAAS_WEBHOOK_TOKEN`. Isso reaproveita `handleActivation` — cria profile, portal token, WhatsApp welcome, email transacional, `pending_insight`. Mesmo caminho de qualquer pagamento válido, sem código especial.

## Fix estrutural — `supabase/functions/webhook-asaas/index.ts`

Adicionar **1 bloco** entre linhas 328 e 332 (depois dos 4 fallbacks atuais, antes do warning final):

```ts
// Fallback autoridade Bacen: PIX Automático provisiona uma fatura, mas o
// cliente pode pagar via chave/QR que gera cobrança avulsa (subscription
// null, apenas customer preenchido). Se existe autorização ACTIVE do mesmo
// customer, esse pagamento É a ativação legítima do ciclo Bacen.
const asaasCustomerId = (payment as any)?.customer as string | undefined;
if (!updated && asaasCustomerId && isPaid) {
  const { data: authByCustomer } = await supabase
    .from("asaas_pix_authorizations")
    .select("*")
    .eq("asaas_customer_id", asaasCustomerId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (authByCustomer) {
    const paymentValue = Number((payment as any).value || 0);
    const expectedValue = Number(authByCustomer.value_cents || 0) / 100;
    // Tolerância R$ 0,50 para arredondamentos; rejeita valores nitidamente diferentes
    // (evita ativar por um PIX aleatório de outro serviço no mesmo cus_).
    const valueMatches = Math.abs(paymentValue - expectedValue) <= 0.5;

    if (!valueMatches) {
      console.warn(
        `[webhook-asaas] Payment ${payment.id} (R$${paymentValue}) não bate com auth ${authByCustomer.asaas_authorization_id} (R$${expectedValue}). Ignorado.`,
      );
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("asaas_payments")
        .insert({
          asaas_payment_id: payment.id,
          asaas_customer_id: asaasCustomerId,
          asaas_subscription_id: authByCustomer.asaas_subscription_id,
          user_id: authByCustomer.user_id,
          customer_name: authByCustomer.customer_name,
          customer_email: authByCustomer.customer_email,
          customer_phone: authByCustomer.customer_phone,
          customer_cpf: authByCustomer.customer_cpf,
          plan: authByCustomer.plan,
          billing_period: authByCustomer.billing_period,
          amount_cents: Math.round(paymentValue * 100) || authByCustomer.value_cents,
          status: newStatus,
          payment_method: "PIX_AUTOMATIC",
          invoice_url: (payment as any).invoiceUrl || null,
          paid_at: new Date().toISOString(),
          fbp: authByCustomer.fbp || null,
          fbc: authByCustomer.fbc || null,
          ga_client_id: authByCustomer.ga_client_id || null,
          raw_payload: payment,
        })
        .select()
        .maybeSingle();

      if (insErr) {
        console.error("[webhook-asaas] Erro reconciliando pagamento Bacen avulso:", insErr);
      } else {
        updated = inserted;
        console.log(
          `[webhook-asaas] ✅ Payment ${payment.id} reconciliado com auth ${authByCustomer.asaas_authorization_id} via customer ${asaasCustomerId}`,
        );
      }
    }
  }
}
```

Ajuste no warning atual (linhas 332-334): logar quando `!updated` sempre (não só quando faltam ids), com nível `error` — pra que qualquer novo caso fique gritante em `failed_message_log` ou nos logs Supabase.

## Salvaguarda de idempotência

O bloco já é idempotente via constraint UNIQUE em `asaas_payment_id` (assumindo que existe — vou verificar antes de codar). Se o mesmo `PAYMENT_RECEIVED` chegar 2x:
- 1ª vez: match falha, cai no fallback, insere, ativa
- 2ª vez: `updated` do UPDATE inicial (linha 174) já retorna a linha existente → fallback nem roda

Se não houver UNIQUE constraint, adiciono via migração no mesmo PR.

## O que **NÃO** vou fazer

- Não crio cron reconciler. Você foi claro: pagamento é na hora. Se o webhook não chegar, é caso de suporte, não de código automático rodando de tempos em tempos.
- Não altero o fluxo canônico dos 4 fallbacks existentes.
- Não toco em Stripe/cartão/D0.
- Não migro o modelo de PIX (Bacen fica).

## Ordem de execução

1. Verificar UNIQUE em `asaas_payment_id` (query rápida).
2. Ativar Juscileia (insert + curl no webhook) — 2 tool calls.
3. Confirmar em `profiles` que a linha da Juscileia foi criada com `status=active`, WhatsApp welcome disparado.
4. Editar `supabase/functions/webhook-asaas/index.ts` com o bloco novo.
5. `deploy_edge_functions` para `webhook-asaas`.
6. Registrar memória `mem/features/payments/pix-bacen-avulso-reconciliation.md` documentando a regra "PAYMENT_RECEIVED + auth ACTIVE do mesmo customer + valor bate = ativa".

## Risco

Baixo:
- 5º fallback só roda quando os 4 anteriores falham (hoje = abandono).
- Tolerância R$ 0,50 no valor evita ativar por PIX aleatório.
- Só ativa se existe `asaas_pix_authorization` ACTIVE — cliente sem autorização Bacen prévia não é afetado.
- Rollback = comentar o `if` novo.

## Arquivos afetados

- `supabase/functions/webhook-asaas/index.ts` (+ ~55 linhas)
- `mem/features/payments/pix-bacen-avulso-reconciliation.md` (novo)