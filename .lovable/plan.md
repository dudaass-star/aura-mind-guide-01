# Validação — "Semanal só na 1ª compra"

## Status atual

**Funcionando (validado no código):**
- `create-checkout` (Stripe): bloqueia retornantes com checagem dupla Stripe (`subscriptions.list status:"all"` por email + variações de telefone) + Asaas (`asaas_payments` com status `CONFIRMED/RECEIVED/RECEIVED_IN_CASH`). Fail-open apenas em erro transitório de banco, com warning.
- `CheckoutV2.tsx`: intercepta 409 `WEEKLY_NOT_AVAILABLE_FOR_RETURNING`, mostra toast, troca para `monthly` e rola ao topo.
- `phoneClean` validado (10-15 dígitos) antes de entrar no `.or()`, então sem risco de match vazio.

## Gap encontrado

`supabase/functions/criar-cartao-asaas/index.ts` também tem fluxo de **weekly trial** (`useTrial = paymentMode === "recurring" && trial === true && billing === "monthly"`, linha 273) e **não** tem a checagem de retornante. Quando o painel admin troca o gateway de cartão de Stripe → Asaas, o `CheckoutV2` chama essa função e retornantes conseguem comprar o Semanal por lá. A regra de negócio (memória `weekly-plan-first-purchase-only`) fica furada nesse caminho.

PIX Asaas (`criar-pix-recorrente-asaas`) não tem trial — sem gap.

## Correção

### 1. `supabase/functions/criar-cartao-asaas/index.ts`
Antes do bloco `if (useTrial)` (~linha 271), aplicar a mesma checagem do `create-checkout`:

- Consultar `asaas_payments` por `customer_email = emailClean OR customer_phone = phoneClean` com status confirmados (`CONFIRMED/RECEIVED/RECEIVED_IN_CASH`), limit 1.
- Consultar Stripe também (mesma lógica de email + `phoneVariations`, `subscriptions.list status:"all"`) para pegar quem já assinou pelo outro gateway antes.
- Se qualquer um retornar histórico: responder **409** com o mesmo shape `{ error, code: "WEEKLY_NOT_AVAILABLE_FOR_RETURNING", suggestedBilling: "monthly" }`.
- Fail-open explícito com `console.warn` em erro transitório, igual `create-checkout`.

### 2. `src/pages/CheckoutV2.tsx`
O handler de 409 atual só cobre a chamada Stripe (`supabase.functions.invoke("create-checkout")`). Localizar a invocação equivalente para `criar-cartao-asaas` (fluxo cartão Asaas) e replicar o mesmo bloco: detectar `code === "WEEKLY_NOT_AVAILABLE_FOR_RETURNING"`, `toast.info`, `setBillingPeriod("monthly")`, scroll to top, `return`.

### 3. Validação pós-deploy
- `supabase--curl_edge_functions` em `criar-cartao-asaas` com email de retornante conhecido (ex: `jefmarper@gmail.com`) + `trial: true, billing: "monthly"` → esperar 409.
- Novo email + trial → esperar 200 (ou o erro de cartão esperado, mas nunca 409).

## Fora de escopo
- Sem mudança em `create-checkout` (já validado ok).
- Sem mudança em PIX (Asaas PIX não tem weekly).
- Sem mudança na memória — a constraint já cobre "todos os gateways".
