## Diagnóstico — ticket Aline (`contato.amendess@gmail.com`)

**Ticket:** `a532a62f-900a-4557-8e28-f316f2415c56` (Cancelamento, abriu em 01/05/2026).

**Linha do tempo:**
1. **01/05** — Aline pede cancelamento (link `/cancelar` falhou).
2. **01/05** — `support-agent` gerou rascunho com `suggested_action = cancel_subscription` mas com `params = {}` (sem `subscription_id`).
3. **02/05** — Admin (`d2d4526a-…`) aprovou o envio e clicou "executar ação". Email saiu prometendo cancelamento. Em `support_ticket_actions` ficou registrado:
   - `action_type: cancel_subscription`
   - `success: false`
   - `error_message: "subscription_id required"`
4. **01/05 + 01/06** — Stripe seguiu cobrando.
5. **12/06** — Aline reclama do débito. Novo rascunho atual já promete cancelamento + estorno das duas faturas.

**Por que a ação falhou:**
- O bloco "auto-resolve" em `support-execute-action` tenta `stripe.customers.list({ email: ticket.customer_email })`. Se o customer no Stripe tem outro email (frequente — checkout usa email diferente do contato), a busca volta vazia e o `subscription_id` continua undefined.
- Não há fallback olhando o `profiles` (que carrega `stripe_customer_id` / `stripe_subscription_id` por user_id, telefone, etc.).
- Profile do ticket está com `profile_user_id` setado, mas a linha não existe mais (`profiles WHERE user_id = '643381ec…'` retorna 0). Cliente provavelmente foi limpa pelo cleanup de inativos, perdendo o vínculo direto.
- Na época do incidente o gate "ação crítica falhou → não envia email" (linhas 250-280 de `AdminSupport.tsx`) provavelmente ainda não estava ativo, então o email foi enviado mesmo com `success:false`.

## Mudanças propostas

### 1. `supabase/functions/support-execute-action/index.ts` — auto-resolve robusto

Antes de cair no `throw "subscription_id required"`, encadear fallbacks na seguinte ordem para `cancel_subscription` / `pause_subscription` / `change_plan` / `refund_invoice`:

```text
1. params.subscription_id / invoice_id (vindo do draft)
2. stripe.customers.list({ email: ticket.customer_email })       ← já existe
3. profiles.select(stripe_customer_id, stripe_subscription_id)
   WHERE email = ticket.customer_email                            ← NOVO
4. profiles.select(...) WHERE user_id = ticket.profile_user_id   ← NOVO
5. stripe.customers.search({query: `metadata['email']:'...'`})   ← NOVO (cobre customers cujo email mudou no Stripe mas tem metadata original)
```

Para cada candidato, listar `subscriptions.list({customer, status:'all'})` priorizando `active` → `trialing` → `past_due` → mais recente.

Logar qual fonte resolveu o ID (telemetria pra detectar lacunas).

### 2. `supabase/functions/support-execute-action/index.ts` — registrar Asaas igual

Mesmo padrão para `cancel_asaas_subscription` / `refund_asaas_payment`: fallback adicional via `profiles.asaas_customer_id` por `customer_email` quando `profile_user_id` está vazio ou órfão.

### 3. `supabase/functions/support-agent/index.ts` — preencher IDs no draft

No prompt do `support-agent`, quando o contexto já trouxer `stripe.subscriptions[*].id` ativo, exigir que `suggested_action.params.subscription_id` venha preenchido. Validar no parse: se `action.type` está em `{cancel_subscription, pause_subscription, change_plan, refund_invoice}` e há ID no contexto mas não em params, injetar o ID antes de gravar o draft (não confiar 100% no LLM).

### 4. `supabase/functions/support-send-reply/index.ts` — gate de consistência

Adicionar verificação defensiva: antes de enviar o email, checar a última linha de `support_ticket_actions` daquele ticket gravada nos últimos 5 minutos. Se for uma ação crítica com `success=false`, recusar o envio com mensagem clara (`"Última ação crítica falhou: {error}. Reabra o draft e tente novamente."`). É backup do gate que já existe no front (caso alguém chame a função por outro caminho).

### 5. Ação manual para o caso da Aline (fora do código)

Depois das mudanças, rodar manualmente pelo `AdminSupport`:
- Aprovar o rascunho atual do ticket `a532a62f-…` (que já promete cancelamento + estorno das faturas `in_1TdN7pQU15XnZ7Vv7BZRn6lT` e `in_1TS8J2QU15XnZ7VvCwPR3niP`).
- Confirmar que `support-execute-action` agora resolve o `subscription_id` via fallback de profile/search e cancela.
- Disparar `refund_invoice` separadamente para cada uma das duas invoices (a ação atual cobre só uma — talvez valer um sub-passo manual no admin ou enriquecer o draft pra emitir duas ações).

## Detalhes técnicos (resumo)

- Arquivos editados: `supabase/functions/support-execute-action/index.ts`, `supabase/functions/support-send-reply/index.ts`, `supabase/functions/support-agent/index.ts`.
- Sem migration de banco.
- Sem mudança no schema de `support_ticket_actions`; apenas mais logs e mais paths de auto-resolve.
- Não muda o contrato exposto ao frontend (`AdminSupport.tsx` continua chamando os mesmos endpoints).
- Não toca em `system_config` nem em provider de WhatsApp.

## Fora do escopo

- Restaurar o profile deletado da Aline (não é necessário pro fix do support).
- Mudar o cleanup de inativos para não apagar profiles com tickets abertos (vale criar memória separada se quiser endereçar depois).
- Refactor maior do `support-agent` em ferramentas/tool-calling.