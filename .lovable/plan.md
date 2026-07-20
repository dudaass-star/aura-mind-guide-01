# Simplificar bloqueio do Semanal + cobrir Asaas cartão + explicar o gap

## Por que passou batido antes

1. **Fail-open silencioso**: o `.select("stripe_customer_id, …")` referencia coluna inexistente em `profiles` (só `asaas_customer_id` existe). PostgREST devolve 400, cai no `catch` genérico da linha 382 e loga *"non-blocking"* — o checkout segue normal. Nenhum 409 sai.
2. **Não testei após implementar**: sem `curl` no endpoint nem inspeção de log. Confiei no código.
3. **A anti-dup antiga (linhas 184-240) só usa API Stripe** — por isso nunca quebrou. O bug apareceu quando misturei query Supabase mal formada.

## Escopo revisado (com Asaas cartão)

Semanal pode entrar por Stripe **ou** Asaas cartão (o gateway ativo é chaveado via `system_config` no admin). Precisamos bloquear retornante **independente** do gateway usado antes.

Fontes de verdade:
- **Stripe**: `stripe.subscriptions.list({ customer, status: "all" })` — cobre canceled/past_due/incomplete.
- **Asaas**: `public.asaas_payments` filtrando por `customer_email` OU `customer_phone` com `status IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')` — cobre PIX e cartão.
- **Não olhar `profiles`**: o schema não tem `stripe_customer_id` e `plan` é ambíguo (fica preenchido mesmo em cancelados). Ir direto na origem elimina o bug atual.

## Mudança única em `supabase/functions/create-checkout/index.ts`

**Remover** o bloco atual do trial (linhas 311-386) — a query Supabase quebrada e a segunda varredura Stripe.

**Adicionar** no fluxo `if (trial)` uma checagem enxuta e explícita:

1. **Reusar `customersToCheck`** (já construído na anti-dup por email + variações de telefone, linhas 188-203). Para cada `cid`, chamar `stripe.subscriptions.list({ customer: cid, status: "all", limit: 3 })`. Qualquer resultado → retornante.
2. **Consultar Asaas** direto: `supabase.from("asaas_payments").select("id").or("customer_email.eq.<email>,customer_phone.eq.<phoneClean>").in("status", ["CONFIRMED","RECEIVED","RECEIVED_IN_CASH"]).limit(1)`. Qualquer linha → retornante.
3. Se qualquer uma disparar, retornar **409** com `code: "WEEKLY_NOT_AVAILABLE_FOR_RETURNING"` e a mensagem/`suggestedBilling: "monthly"` que já existe hoje. Log `hasStripeHistory` / `hasAsaasHistory` pra observabilidade.

Sem try/catch mascarando: se a query Asaas falhar por erro de infra, logar e **prosseguir** (fail-open explícito e comentado, não acidental). Se a query voltar `error != null` mas com resposta válida (schema quebrado, coluna errada), a função vai lançar — melhor barulho do que bug silencioso.

Diff: ~40 linhas a menos, uma responsabilidade por bloco, sem acoplamento com `profiles`.

## Não afetar quem já pagou (jefmarper e afins)

Fix é **só na porta de entrada** (`create-checkout`). Quem já concluiu o Semanal continua com a subscription rodando normal — em ~7 dias a Stripe cobra o preço mensal recorrente conforme o mandato CIT→MIT. Nada é revertido, nenhuma linha do banco é tocada, nenhuma cobrança cancelada. A regra só impede a **próxima** tentativa de assinar Semanal de novo.

## Validação (obrigatória desta vez)

Após o deploy do `create-checkout`:

1. `supabase--curl_edge_functions` POST em `/create-checkout` com `{ trial: true, plan: "essencial", email: "jefmarper@gmail.com", phone: "5511976982383", name: "Jef", paymentMethod: "card" }` → esperar **409** + `code: "WEEKLY_NOT_AVAILABLE_FOR_RETURNING"`.
2. Mesmo POST com email/telefone novos → esperar **200** com `clientSecret`.
3. `edge_function_logs` do `create-checkout`: confirmar `⛔ Weekly blocked for returning customer` no caso 1 e ausência do warning `non-blocking` em qualquer chamada.

## Fora de escopo

- **Frontend (`CheckoutV2.tsx`)**: handler do 409 já está correto (linhas 445-458). Não muda.
- **Memória `weekly-plan-first-purchase-only`**: regra mantida — só a execução fica mais enxuta e cobre Asaas.
- **Assinatura ativa do jefmarper**: intocada.
- **Migration**: nenhuma. Não há mudança de schema.
