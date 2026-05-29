## Objetivo
Permitir que o assinante troque de plano (Essencial / Direção / Transformação, mensal ou anual) direto no `/meu-espaco`, sem passar pelo Stripe Billing Portal. A troca é feita via edge function que atualiza o `subscription_item` no Stripe com proração automática.

## Escopo
- Apenas troca entre planos **ativos por cartão** (mensal/anual). PIX/Boleto/Trial ficam de fora nessa V1.
- Sem novo checkout — reaproveita o método de pagamento já cadastrado.
- Sem mudar fluxo de cancelamento nem onboarding.

## UX no /meu-espaco

Nova seção no rodapé, acima de "Atualizar forma de pagamento":

```text
┌─────────────────────────────────────┐
│  Seu plano atual: Direção (mensal)  │
│  [ Trocar de plano ]                │
└─────────────────────────────────────┘
```

Clique abre um **Dialog** (shadcn) com:
- 3 cards de plano (Essencial / Direção / Transformação) + toggle Mensal/Anual.
- Card do plano atual marcado como "Seu plano".
- Preço de cada plano + breve descrição (mesmas usadas no checkout).
- Botão "Trocar para este plano" só ativo nos planos diferentes do atual.
- Aviso curto: *"A diferença proporcional é cobrada (ou creditada) automaticamente no próximo ciclo."*
- Confirmação em 2 passos: ao clicar, mostra resumo (`De X para Y · cobrança proporcional hoje`) e botão "Confirmar troca".
- Toast de sucesso + refetch do perfil.

Nada de upsell proativo na Aura — segue a `no-upsell-policy`. O usuário só vê isso ao entrar no portal.

## Backend

### Nova edge function: `change-subscription-plan`
Localizada em `supabase/functions/change-subscription-plan/index.ts`. Padrão igual a `cancel-subscription` (Stripe SDK, service role, logs com `logStep`).

Input (POST JSON):
```json
{ "userId": "uuid", "targetPlan": "essencial|direcao|transformacao", "billing": "monthly|yearly" }
```

Lógica:
1. Valida `userId`, `targetPlan`, `billing` com Zod.
2. Busca `profiles` por `userId` → pega `email` / `phone` / `plan` atual.
3. Resolve customer no Stripe pelo email (fallback phone metadata — mesmo padrão de `cancel-subscription`).
4. Lista subscriptions `status in (active, trialing, past_due)` desse customer. Pega a primeira.
5. Bloqueia troca se:
   - assinatura está em `canceled` ou com `cancel_at_period_end=true` → devolve erro amigável.
   - assinatura usa price PIX/Boleto/Trial (compara contra os env `STRIPE_PRICE_*_PIX_YEARLY` e `*_TRIAL`) → erro amigável pedindo pra falar no suporte.
   - `targetPlan + billing` resolve no mesmo `price_id` atual → erro "Você já está nesse plano".
6. Mapeia `targetPlan + billing` → `targetPriceId` usando os env `STRIPE_PRICE_<PLAN>_<MONTHLY|YEARLY>`.
7. Chama `stripe.subscriptions.update(subId, { items: [{ id: currentItemId, price: targetPriceId }], proration_behavior: "create_prorations", payment_behavior: "error_if_incomplete", metadata: { plan: targetPlan, last_plan_change_at: now } })`.
8. Atualiza `profiles.plan` para o novo plano (o `stripe-webhook` também atualiza via `customer.subscription.updated`, mas escrevemos aqui pra UI refletir imediato).
9. Loga em `audit_log` / console.
10. Retorna `{ ok: true, newPlan, newBilling }`.

Erros são devolvidos com mensagem PT-BR pronta pra toast.

### Config
- `supabase/config.toml`: adicionar bloco da nova função com `verify_jwt = false` (mesmo padrão das outras chamadas via portal token).
- Sem secrets novos: reaproveita `STRIPE_SECRET_KEY` e os `STRIPE_PRICE_*` que já existem.

## Frontend

### Novo componente
`src/components/portal/ChangePlanDialog.tsx`:
- Props: `currentPlan`, `currentBilling`, `userId`, `onChanged`.
- Usa `supabasePortal.functions.invoke("change-subscription-plan", { body })`.
- Cards de plano vêm de um const local `PLANS` (id, nome, preço mensal, preço anual, descrição curta) — não precisa nova tabela.

### Mudanças em `src/pages/UserPortal.tsx`
- Estender o `select` do `profiles` pra trazer também a billing (ex.: `plan, billing_cycle` — se a coluna não existir, derivamos do price atual via campo extra retornado pela edge ou simplesmente assumimos `monthly` por padrão na V1).
- Renderizar bloco "Seu plano atual" no rodapé, acima do botão de pagamento.
- Após sucesso, invalidar query `portal-profile`.

## Detalhes técnicos
- **Proração:** `create_prorations` (Stripe gera invoice imediato com a diferença). Alternativa futura: `none` + cobrança só na renovação.
- **Falha de pagamento:** `payment_behavior: "error_if_incomplete"` evita assinatura ficar em `incomplete`. Mensagem do erro Stripe é convertida em PT-BR genérica ("Não conseguimos cobrar a diferença no seu cartão. Atualize o cartão e tente de novo.").
- **Webhook:** o `stripe-webhook` já trata `customer.subscription.updated` e grava `profiles.plan` a partir de `subscription.metadata.plan` — passamos o novo `plan` no metadata pra ele se manter consistente.
- **Trial em curso:** se `subscription.status === "trialing"`, bloqueamos na V1 (mensagem: "Você ainda está no trial. A troca de plano libera após o primeiro pagamento."). Evita complexidade de re-precificar trial.

## Fora de escopo
- Troca a partir de PIX/Boleto/Trial.
- Cupom/desconto no upgrade.
- Histórico de mudanças de plano na UI.
- Mexer no fluxo de cancelamento ou no checkout inicial.

## Validação
1. `supabase functions deploy change-subscription-plan` automático no Lovable.
2. Teste manual:
   - Logar no `/meu-espaco` como usuário com assinatura mensal Essencial ativa.
   - Trocar pra Direção mensal → confirmar `subscription.items[0].price` no Stripe + `profiles.plan` atualizado + invoice de proração gerado.
   - Tentar trocar pra mesmo plano → erro amigável.
   - Tentar com assinatura em trial → erro amigável.
3. Conferir logs `[CHANGE-SUBSCRIPTION-PLAN]` na edge.
