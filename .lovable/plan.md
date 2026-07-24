# Onda 2A — Escada de Retenção no Asaas cartão

## Objetivo
Dar paridade total ao fluxo Asaas cartão dentro do `cancel-subscription`, cobrindo as 4 ações que a Onda 1 já entrega no Stripe (`pause`, `apply_discount_3m`, `downgrade_to_lite`, `downgrade_to_base`) + `cancel` e `check`. PIX Asaas fica fora (não tem instrumentos nativos equivalentes; segue redirecionando pra suporte).

## Escopo (o que ENTRA)

### 1. Resolver o gateway do usuário antes de decidir o fluxo
- Hoje `cancel-subscription` busca customer no Stripe primeiro; se não achar, devolve `gateway_unsupported`.
- Ajuste: se o perfil tiver `card_gateway = 'asaas_card'` (ou não achar no Stripe mas achar subscription Asaas cartão via `asaas_payments`), roteia pro branch Asaas em vez de bloquear.
- Se for `asaas_pix` → mantém `gateway_unsupported: true` com mensagem existente (PIX segue fora da escada por ora).

### 2. Novo branch Asaas cartão (reusa padrão de `change-asaas-plan`)

Helpers internos ao próprio `cancel-subscription/index.ts` (sem novo arquivo compartilhado — mantém o edge function coeso):
- `asaasFetch(path, init)`: mesmo padrão do `change-asaas-plan` (base URL sandbox/production, header `access_token`).
- `findActiveAsaasSubscription(customerId)`: pega em `asaas_payments` a subscription mais recente com `payment_method='CREDIT_CARD'` e `asaas_subscription_id` não-nulo em status ativo/pending; ignora `CREDIT_CARD_INSTALLMENT` e PIX.
- `fetchAsaasSubscriptionDetails(subId)`: retorna `{ nextDueDate, value, cycle, creditCardToken }`.

Ações:

**a) `check`**
Devolve o mesmo shape que hoje (`subscription.id/plan/endDate/amount_cents/price_id`, `value_recap`, `discount_available`, `reasons`), preenchido com dados do Asaas:
- `plan` = label do `profiles.plan` (Essencial/Direção/Transformação).
- `endDate` = `nextDueDate`.
- `amount_cents` = `value * 100`.
- `price_id` = `asaas_subscription_id` (identificador equivalente).
- `gateway: "asaas_card"` (para o frontend saber que os planos Lite/Base vão via workaround).

**b) `pause` (30/60/90 dias)**
Asaas não tem pause nativo em `/subscriptions`. Workaround:
1. Salva snapshot da sub antiga (`value`, `cycle`, `nextDueDate`, `creditCardToken`) em `scheduled_tasks` com `execute_at = agora + pause_days` e `payload = { intent: 'asaas_resume_subscription', ... }`.
2. Cancela a subscription atual (`DELETE /subscriptions/{id}`) — para de cobrar imediatamente.
3. `profiles.status = 'paused'`.
4. `execute-scheduled-tasks` ganha handler `asaas_resume_subscription`: recria `/subscriptions` com o mesmo `creditCardToken` + `nextDueDate = hoje` no fim da pausa e volta `status = 'active'`.

Se `creditCardToken` estiver ausente → retorna `success: false, needs_new_card: true` com mensagem "sua forma de pagamento precisa ser refeita antes de pausar" (mesmo padrão do 409 em `change-asaas-plan`).

**c) `apply_discount_3m` (30% off por 3 meses)**
Asaas não tem cupom com duração limitada. Workaround (mesmo caminho do plano original):
1. Cria nova `/subscriptions` com `value = value_atual * 0.70`, mesmo `cycle`, mesmo `nextDueDate`, mesmo `creditCardToken`, `externalReference = aura_retention_discount_${userId}_${ts}`.
2. Cancela a sub antiga (`DELETE`).
3. Cria 1 `scheduled_tasks` com `execute_at` = data da 4ª cobrança (`nextDueDate + 3 × ciclo`), `payload = { intent: 'asaas_restore_full_price', user_id, subscription_id, full_value, cycle, card_token }`.
4. `execute-scheduled-tasks` handler `asaas_restore_full_price`: cria nova sub com valor cheio + cancela a de desconto.
5. Registra em `cancellation_feedback` (`save_tier='discount_30'`) e `retention_events` — reusa a mesma trava `hasRecentDiscount` (12 meses).

**d) `downgrade_to_lite` / `downgrade_to_base` (R$19,90 / R$9,90)**
Reusa exatamente o padrão de `change-asaas-plan`:
1. Cria nova `/subscriptions` com `value=19.90` ou `9.90`, `cycle=MONTHLY`, mesmo `nextDueDate`, mesmo `creditCardToken`, `description = "Aura Lite/Base"`.
2. Cancela a sub antiga.
3. `profiles.plan_tier = 'lite'|'base'`, `status='active'`, `billing_cycle='monthly'`.
4. Grava `cancellation_feedback` + `retention_events` (`gateway='asaas_card'`).

**e) `cancel`**
`DELETE /subscriptions/{id}` + `profiles.status='canceling'` + `cancellation_feedback`. Mantém acesso até `nextDueDate` (paridade com `cancel_at_period_end` do Stripe — mas como Asaas cancela na hora, guarda `access_until = nextDueDate` em `profiles` pra frontend/portal respeitar).

### 3. Extensão de `execute-scheduled-tasks`
Adicionar 2 handlers novos, cada um idempotente (checa se a task já rodou via `status`):
- `asaas_resume_subscription`
- `asaas_restore_full_price`

Ambos com try/catch — se Asaas falhar (ex: cartão expirou), grava `error_message` na task e envia email/WhatsApp pro admin (padrão `ADMIN_ALERT_EMAIL`).

### 4. Frontend `CancelSubscription.tsx`
- Já lida com `gateway_unsupported` hoje. Ajuste: quando `gateway: "asaas_card"` volta em `check`, mostra o mesmo fluxo do Stripe (sem banner de "fale com suporte").
- Adiciona texto discreto na tela de desconto/downgrade Asaas: "A cobrança nova entra a partir do próximo vencimento (DD/MM)." (usa `nextDueDate` do check).

### 5. KPIs `AdminEngagement.tsx`
- Já lêem `retention_events` sem filtrar gateway. Adicionar breakdown `Stripe vs Asaas cartão` no card "Save por tier" (2 barras por tier).

## O que NÃO entra
- PIX Asaas (nem recorrente, nem Bacen) — segue com `gateway_unsupported` na escada. Motivo: sem `creditCardToken` equivalente pra reusar; qualquer downgrade/desconto exige o cliente reautorizar no banco.
- Dunning WhatsApp/Email da escada (Onda 2B).
- Novos preços/produtos — Lite e Base já foram criados no Stripe; no Asaas usamos `value` direto no `/subscriptions` (não há catálogo de products).

## Detalhes técnicos

Arquivos tocados:
- `supabase/functions/cancel-subscription/index.ts` (branch Asaas cartão + helpers inline).
- `supabase/functions/execute-scheduled-tasks/index.ts` (2 handlers novos).
- `src/pages/CancelSubscription.tsx` (remove banner Asaas quando gateway é `asaas_card`, adiciona nota de próximo vencimento).
- `src/pages/AdminEngagement.tsx` (breakdown por gateway no card de save por tier).

Sem migration nova — `scheduled_tasks`, `retention_events`, `cancellation_feedback.save_tier/gateway`, `profiles.plan_tier/access_until` já existem da Onda 1 / infra atual.

Estrutura do payload em `scheduled_tasks`:
```text
asaas_resume_subscription
  payload: { user_id, customer_id, value, cycle, card_token, description }

asaas_restore_full_price
  payload: { user_id, customer_id, discount_subscription_id, full_value, cycle, card_token }
```

Trava anti-abuso: `hasRecentDiscount` (12 meses via `cancellation_feedback.save_tier='discount_30'`) já é gateway-agnóstica, funciona automaticamente pro Asaas.

## Riscos e mitigações
- **Cartão sem `creditCardToken` salvo**: retorna erro claro pedindo pra refazer checkout (mesmo padrão de `change-asaas-plan`). Evita orfanato de subs.
- **Scheduled task falhar** (cartão expirado no restore): handler grava erro + alerta admin; usuário fica temporariamente no desconto/pausa até intervenção manual — mais seguro do que cobrança falhando silenciosa.
- **Sub antiga não cancelar** após criar a nova: best-effort com log; reconciliação já roda em `reconcile-subscriptions` e detecta duplicatas.
- **Race durante pausa** (webhook Asaas processando enquanto cancelamos): idempotência via `event_id` já existente em `webhook-asaas`.

## Validação pós-deploy
- Teste manual com 1 usuário Asaas cartão de teste: `check → apply_discount_3m` (confirma nova sub com value 0.7×, task agendada), rollback manual da task, `check → downgrade_to_lite` (confirma value 19.90), `check → pause 30d` (confirma sub cancelada + task de resume).
- Query em `retention_events WHERE gateway='asaas_card'` mostra os eventos.

## Ordem de execução
1. Cancel-subscription: helpers + branch Asaas (todas as 5 ações).
2. Execute-scheduled-tasks: 2 handlers novos.
3. Frontend: ajustes em `CancelSubscription.tsx` + `AdminEngagement.tsx`.
4. Typecheck + preview manual do fluxo.
