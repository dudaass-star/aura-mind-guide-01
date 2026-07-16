
## Contexto

Leandro Leite Lopes (user `2d110f3c…`, phone 554499542844) migrou do cartão Stripe pra PIX Automático Asaas em **06/07/2026** e pagou a mensalidade Direção via PIX (R$49,90, coberto até 06/08). Mas a assinatura Stripe cartão **não foi cancelada** — está tentando cobrar o cartão desde 15/07 e falhando por falta de saldo. Além disso, a ativação Asaas não populou os campos `asaas_customer_id` / `card_gateway` no `profile`, então o portal dele mostra `past_due` e o botão de atualizar pagamento apontou pro fluxo errado (Stripe cartão em vez de mostrar que já tá quitado via PIX).

Cliente já entrou em contato pelo suporte pedindo pra desativar as tentativas de cobrança no cartão.

Plano em duas frentes: (1) resolver o caso do Leandro hoje, (2) corrigir os dois bugs sistêmicos por trás disso.

---

## Parte 1 — Ação imediata no caso do Leandro

1. **Verificar via Stripe** se `invoice.paid` de R$49,90 do dia 15/07 (invoice `in_1Tq0WpQU15XnZ7VvREymp3aa`) realmente capturou dinheiro. Se sim, avaliar refund; se foi trial/zero, seguir sem refund. (Cliente afirma que não passou.)
2. **Cancelar Stripe subscription `sub_1TnTBLQU15XnZ7VvB3FvnAQG`** imediatamente (`cancel_at_period_end=false`) via `stripe_api_write` — para os retries.
3. **Corrigir o `profile` do Leandro** via migration:
   - `asaas_customer_id = 'cus_000185547270'`
   - `card_gateway = 'asaas'`
   - `status = 'active'`
   - `payment_failed_at = null`
   - `plan_expires_at` já está correto (06/08).
4. **Preparar texto de resposta ao email de suporte** confirmando: Stripe cancelada, cobranças no cartão paradas, PIX ativo e vigente até 06/08. (Envio é você pelo painel.)

---

## Parte 2 — Bug sistêmico A: cancelar Stripe quando cliente ativa PIX Asaas

**Sintoma:** cliente com Stripe cartão ativa cria assinatura PIX Asaas → fica com 2 assinaturas cobrando em paralelo.

**Correção em `supabase/functions/webhook-asaas/index.ts`**, dentro de `handleActivation()`, depois do `resolveProfile`:

- Se o profile tem Stripe subscription `active`/`past_due`/`trialing` (lookup por email no Stripe, já que não guardamos `stripe_subscription_id` no profile), chamar `stripe.subscriptions.cancel(subId)` com `invoice_now=false, prorate=false`.
- Logar como `[migration-cleanup]`.
- Nunca abortar a ativação Asaas se o cancel Stripe falhar — só `console.error`.

---

## Parte 3 — Bug sistêmico B: activation Asaas não popula profile

**Sintoma:** Leandro pagou PIX, `asaas_payments` gravou tudo, `plan_expires_at` foi estendido, mas `asaas_customer_id` e `card_gateway` continuam nulos. Portal continua tratando ele como Stripe cartão.

**Investigação:** ler `supabase/functions/webhook-asaas/index.ts` e `_shared/profile-resolver.ts`. Hipótese: o branch *returning* (Leandro veio de trial Stripe) não escreve `asaas_customer_id` / `card_gateway`, só estende o `plan_expires_at`.

**Correção:** todos os branches de `handleActivation` que reconhecem pagamento Asaas devem gravar `asaas_customer_id` e `card_gateway='asaas'` no profile, além de limpar `payment_failed_at` e forçar `status='active'`.

---

## Parte 4 — Auditoria retroativa

Rodar SQL para achar outros afetados:
```sql
SELECT p.user_id, p.name, p.email, p.status, p.card_gateway, p.asaas_customer_id,
       ap.asaas_subscription_id, ap.paid_at
FROM profiles p
JOIN asaas_payments ap ON ap.user_id = p.user_id AND ap.status IN ('RECEIVED','CONFIRMED')
WHERE p.asaas_customer_id IS NULL OR p.card_gateway IS NULL;
```

Cada retorno é candidato ao mesmo problema:
- Fix do profile via migration em lote.
- Cruzar com Stripe (subs `active` no mesmo email) → cancelar Stripe onde estiver duplicado.

---

## Ordem sugerida

1. Parte 1 (Leandro) — verificar invoice, cancelar Stripe, corrigir profile, texto de resposta.
2. Parte 4 (auditoria) — dimensionar o problema.
3. Parte 3 (fix populate profile) — para o sangramento novo.
4. Parte 2 (fix cancel Stripe no webhook Asaas) — bloqueia dupla-cobrança futura.

Se preferir enxuto: Parte 1 + Parte 4 agora, 2+3 depois.

## Não vou fazer sem sua confirmação

- Cancelar Stripe do Leandro.
- Migration alterando o profile dele.
- Qualquer refund (só se a verificação da invoice mostrar captura real e você aprovar).
