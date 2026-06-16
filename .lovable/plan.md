## Contexto

Compras de ontem/hoje (fermaion 15/06, camilamuri 16/06) são Stripe cartão "Direção mensal" no `/v2`. O código de envio CAPI existe em `stripe-webhook` mas não há prova de que está saindo nem de que o Meta está aceitando — logs da edge function não retêm o suficiente. Para PIX Asaas, hoje não há envio CAPI nenhum.

Regra fixada pelo usuário (vai pra `mem://`): **Purchase no Meta = só 1ª compra do cliente vindo do anúncio. Renovações e cobranças recorrentes nunca disparam Purchase.**

## O que vou fazer

### 1. Definir "primeira compra" de forma determinística

Critério único, aplicado nos dois gateways:
- **Stripe**: é 1ª compra quando `checkout.session.completed` (qualquer modo) ou `invoice.paid` cujo `billing_reason` ∈ {`subscription_create`, `subscription_cycle` apenas se for a 1ª invoice da subscription}. Na prática, simplifico: dispara Purchase **apenas em `checkout.session.completed`**. Renovações chegam via `invoice.paid` e ficam sem Purchase.
- **PIX Asaas**: é 1ª compra quando o `asaas_payments.id` é o 1º pagamento confirmado da `asaas_subscription_id` (mesma lógica que já usamos no indicador de checkout abandonado). Renovações automáticas Asaas ficam fora.

Não dispara Purchase em: `invoice.paid` recorrente, `customer.subscription.updated`, `PAYMENT_RECEIVED` de renovação Asaas, troca de plano, retomada, dunning recuperado.

### 2. Limpar disparos atuais que violam a regra

`supabase/functions/stripe-webhook/index.ts`:
- Manter os dois `Purchase` existentes (linhas 567 e 836) — ambos rodam dentro de `checkout.session.completed`, então já são 1ª compra. ✅
- **Não** adicionar Purchase em `invoice.paid` (cancela a ideia anterior).
- Garantir `event_id = session.id` único (já está) para dedup.

`supabase/functions/webhook-asaas/index.ts`:
- Adicionar disparo CAPI `Purchase` em `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` **somente se o pagamento for o 1º da `asaas_subscription_id`** (consulta `asaas_payments` ordenado por `created_at`, compara `id`). Renovações: nada.
- `event_id = asaas_payment_id`.
- `user_data`: `email`, `phone` (do customer/profile), e `fbp`/`fbc` se persistidos.

### 3. Propagar `fbp`/`fbc` no PIX (hoje some)

- `src/pages/CheckoutV2.tsx`: ler `_fbp`/`_fbc` dos cookies (já tem helper p/ Stripe) e passar em `invoke("criar-pix-recorrente-asaas")`.
- `supabase/functions/criar-pix-recorrente-asaas/index.ts`: receber `fbp`/`fbc`/`ga_client_id`, persistir.
- Migration nova: adicionar `fbp text`, `fbc text`, `ga_client_id text` em `asaas_pix_authorizations` e em `asaas_payments` (para resolver na hora do webhook).
- `webhook-asaas`: ler esses campos do pagamento ou da authorization vinculada antes de enviar CAPI.

### 4. Auditoria persistente (necessária pra diagnosticar agora)

Migration nova `public.meta_capi_log`:
- `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`
- `event_name text`, `event_id text`, `source text` (`stripe-webhook` / `webhook-asaas`)
- `is_first_purchase bool`
- `email_present bool`, `phone_present bool`, `fbp_present bool`, `fbc_present bool`
- `request_value numeric`
- `meta_status int`, `meta_fbtrace_id text`, `meta_error text`, `raw_response jsonb`
- GRANT + RLS: `service_role` escreve/lê tudo; `authenticated` lê só se `has_role(auth.uid(),'admin')`.

`supabase/functions/meta-capi/index.ts`: após receber resposta da Graph API, inserir 1 linha em `meta_capi_log` com `fbtrace_id` extraído. Fire-and-forget.

### 5. Validação

Após deploy:
```sql
SELECT created_at, event_name, source, is_first_purchase,
       meta_status, meta_fbtrace_id, meta_error,
       fbp_present, fbc_present, request_value
FROM meta_capi_log
WHERE created_at >= now() - interval '48 hours'
ORDER BY created_at DESC;
```
Esperado: linhas só para `event_name='Purchase'` com `is_first_purchase=true`, `meta_status=200`. Renovações Stripe (`invoice.paid` recorrente) e renovações Asaas: **zero** linhas. Se Meta retornar erro, vejo o motivo direto.

### 6. Memória

Salvar regra em `mem://marketing/meta-purchase-first-only` e referenciar no índice: "Purchase Meta = só 1ª compra; renovações Stripe/Asaas nunca disparam Purchase."

## Não vou fazer

- Não vou reativar Pixel `Purchase` no browser (continua só CAPI server-side).
- Não vou criar UI admin nova; consulta SQL na tabela basta.
- Não vou tocar em StartTrial, Lead, InitiateCheckout — só Purchase.

## Arquivos tocados

- `supabase/functions/meta-capi/index.ts` (log)
- `supabase/functions/stripe-webhook/index.ts` (nenhuma adição de Purchase em renovação — confirmar)
- `supabase/functions/webhook-asaas/index.ts` (novo Purchase com guard de 1ª compra)
- `supabase/functions/criar-pix-recorrente-asaas/index.ts` (recebe e persiste fbp/fbc)
- `src/pages/CheckoutV2.tsx` (envia fbp/fbc também no PIX)
- Migration nova: `meta_capi_log` + colunas em `asaas_pix_authorizations` e `asaas_payments`
- `mem://marketing/meta-purchase-first-only` + `mem://index.md`
