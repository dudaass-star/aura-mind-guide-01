## Contexto e diagnóstico

O plano **Semanal** (R$ 6,90 / 9,90 / 19,90) foi desenhado como **isca de aquisição** — porta de entrada barata para converter em recorrente. Hoje o `create-checkout` só bloqueia quem tem assinatura **ativa/trialing** (anti-dup). Quem já foi cliente e cancelou consegue voltar pelo Semanal quantas vezes quiser — como o caso `jefmarper@gmail.com` (Direção mensal em maio → cancelou → voltou no Semanal em julho).

Isso quebra a proposta: o Semanal deixa de ser aquisição e vira um "downgrade disfarçado" para churners recorrentes, corroendo LTV.

**Concordo com a regra**: Semanal é 1× por cliente. Retornante deve ir direto para Mensal/Trim/Sem/Anual.

## Escopo

Backend-only + copy no checkout. Sem mudar a landing.

### 1. Bloqueio server-side em `create-checkout` (fonte da verdade)

Quando `trial === true` (fluxo Semanal), rodar uma checagem de "cliente retornante" **antes** de criar a Session. Retornante = qualquer um dos abaixo:

- **Profile existente** em `profiles` para o mesmo email OU telefone normalizado com `stripe_customer_id` preenchido, OU `asaas_customer_id` preenchido, OU `plan` já setado alguma vez (indica compra anterior).
- **Stripe**: `stripe.customers.list({email})` retornando algum customer com **qualquer** subscription histórica (`status: 'all'` — inclui `canceled`, `incomplete_expired`, `past_due`, `unpaid`, além de `active`/`trialing`).
- **Asaas**: existe `asaas_payments` com `status IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')` para o `asaas_customer_id` ligado a esse email/telefone.

Se qualquer condição bater, retornar **HTTP 409** com:
```json
{
  "error": "O Plano Semanal é só pra primeira experiência. Como você já assinou antes, escolha um dos planos recorrentes (mensal, trimestral, semestral ou anual).",
  "code": "WEEKLY_NOT_AVAILABLE_FOR_RETURNING",
  "suggestedBilling": "monthly"
}
```

O anti-dup atual (assinatura ativa) permanece — ele cobre "quem tá pagando agora"; a nova regra cobre "quem já pagou antes".

### 2. UX no `CheckoutV2.tsx`

Tratar o `code: "WEEKLY_NOT_AVAILABLE_FOR_RETURNING"`:
- Mostrar toast com a mensagem retornada.
- Trocar automaticamente o `billingPeriod` para `monthly` (recorrente cartão sem trial, ou o próximo caminho disponível).
- Rolar até o toggle de período pra deixar claro qual a alternativa.

### 3. Memória do projeto

Salvar `mem://business/weekly-plan-first-purchase-only.md` como **constraint**: "Semanal é 1× por CPF/email/telefone. Retornantes vão direto pro recorrente."

## Fora do escopo

- Bloqueio no Asaas PIX Semanal — hoje não existe PIX Semanal (Asaas PIX só recorrente nos 4 ciclos), então nada a fazer lá.
- Migração de dados históricos ou refund de quem já comprou o Semanal 2×.
- Blindagem contra fraude com email/telefone novo — quem quiser burlar cria conta nova; o objetivo aqui é higienizar o fluxo legítimo, não caçar abuso.
- Mudança na landing page ou remoção do Semanal da vitrine (Semanal continua exposto como oferta pública — só quem já foi cliente é redirecionado).

## Detalhes técnicos

- Arquivo: `supabase/functions/create-checkout/index.ts` — inserir bloco de checagem logo depois do lookup de `profile`/`customer` e **antes** da montagem de `sessionConfig`, no ramo `if (trial)`.
- Query Supabase: `select stripe_customer_id, asaas_customer_id, plan, billing_cycle from profiles where email = ? or phone_normalized = ? limit 1`.
- Stripe: `stripe.subscriptions.list({customer: cid, status: 'all', limit: 5})` — se `.data.length > 0`, é retornante.
- Log: `logStep("⛔ Weekly blocked for returning customer", { email, hasProfile, hasStripeHistory, hasAsaasHistory })` para auditoria.
- Frontend: `CheckoutV2.tsx` já trata `error?.context?.error` — adicionar branch por `code === "WEEKLY_NOT_AVAILABLE_FOR_RETURNING"` no `catch`/response handler do submit.

## Validação

1. Testar com `jefmarper@gmail.com` (retornante conhecido) → deve receber 409.
2. Testar com email totalmente novo → checkout Semanal segue normal.
3. Verificar em `edge_function_logs` se o log de bloqueio aparece.
