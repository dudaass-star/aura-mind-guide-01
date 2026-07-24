# Onda 2B — Asaas PIX + Dunning WhatsApp na escada de retenção

## Objetivo
Fechar as duas lacunas restantes da escada:
1. **Asaas PIX recorrente** — hoje cai em `gateway_unsupported`. Dar paridade parcial (pause, downgrade e cancel) no que é possível sem `creditCardToken`.
2. **Dunning WhatsApp** — reforço da recuperação via canal onde a conversão acontece, complementando o email já ativo.

## Parte 1 — Asaas PIX na escada

### O que é possível vs. o que não é
PIX recorrente Asaas não tem token de instrumento salvo — cada cobrança gera um QR novo que o cliente autoriza no app do banco. Isso limita workarounds:

| Ação | PIX Asaas | Como |
|---|---|---|
| `check` | Sim | Igual cartão Asaas: lê `nextDueDate`/`value`/`cycle` da sub |
| `pause` (30/60/90d) | Sim | `DELETE` sub + `scheduled_task` recria sub com mesmo `value/cycle` e `nextDueDate = fim_da_pausa` |
| `apply_discount_3m` | Não | Sem token não dá pra garantir cobrança automática nas próximas 3 — cliente teria que reautorizar cada QR |
| `downgrade_to_lite/base` | Sim | `DELETE` sub antiga + `POST /subscriptions` PIX com `value=19.90` ou `9.90`, mesmo `nextDueDate` |
| `cancel` | Sim | `DELETE` sub + `profiles.status='canceling'` |

`apply_discount_3m` fica desabilitado no PIX (o `check` já retorna `discount_available: false` com motivo explícito).

### Roteamento
Extender `cancel-subscription/index.ts`:
- Detecta `profile.card_gateway === 'asaas_pix'` (ou fallback: acha sub Asaas PIX ativa via `asaas_payments.payment_method = 'PIX'`).
- Roteia pra novo branch `handleAsaasPix` (helpers reusam `getAsaasClient`, `brtDatePlusDays`, `PLAN_LABELS`).
- Se ação = `apply_discount_3m` → retorna `{ success: false, message: "Desconto disponível apenas para cartão. Ver opções abaixo.", discount_available: false }` sem quebrar UX.

### Novo handler em `execute-scheduled-tasks`
- `asaas_pix_resume_subscription` (paralelo do `asaas_resume_subscription`): recria sub PIX com `billingType='PIX'`, sem `creditCardToken`.
- Idempotente via `scheduled_tasks.status`.

### Frontend `CancelSubscription.tsx`
- `check` PIX retorna `gateway: 'asaas_pix'` + `discount_available: false`. UI já esconde card de desconto quando `discountAvailable=false` → nada muda visualmente exceto ausência da oferta 30%.
- Ajuste: quando `gateway === 'asaas_pix'`, adicionar linha discreta "O PIX recorrente reinicia no próximo vencimento — o QR chega automático" abaixo da nota de `nextDueDate`.

### KPI Admin
`AdminEngagement.tsx` já tem breakdown `byGateway`. Confirmar que `asaas_pix` aparece separado de `asaas_card` (já está — mesma query, agrupamento por `gateway`).

## Parte 2 — Dunning WhatsApp

### Estado atual (verificado)
- `_shared/dunning-whatsapp.ts` já existe e implementa envio via subaccount Twilio (não o número da Aura).
- Template aprovado: `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` ({{1}}=nome, {{2}}=link portal).
- Limite: 2 envios por subscription, casado com Smart Retries Stripe / retries Asaas.
- Idempotência por `dunning_attempts (event_id, channel='whatsapp', profile_user_id)`.
- Falta confirmar: **quais webhooks realmente chamam `sendDunningWhatsApp` hoje?** Investigação na primeira etapa.

### Escopo
1. **Auditar** os webhooks de falha de cobrança (`stripe-webhook`, `webhook-asaas`) e verificar se `sendDunningWhatsApp` é invocado nos eventos:
   - Stripe: `invoice.payment_failed`, `customer.subscription.updated` (past_due).
   - Asaas: `PAYMENT_OVERDUE` (cartão e PIX).
2. **Adicionar** as chamadas onde faltar. Passar `provider`, `eventId` (idempotência), `subscriptionId/paymentId`, `profile`.
3. **Cadenciar** com o email: WhatsApp dispara junto do 2º email (não do 1º) — evita saturar o cliente. Regra: `attempt_number >= 2` no `dunning_attempts` de email OU tentativa 2 do Smart Retries.
4. **Silent hours 22h-08h BRT**: dunning é utility/transacional, então **ignora quiet hours** (conforme comentário no arquivo). Confirmar decisão com o usuário — ver perguntas.

### Arquivos tocados (Parte 2)
- `supabase/functions/stripe-webhook/index.ts` — adicionar `sendDunningWhatsApp` no handler de `invoice.payment_failed` (se ausente).
- `supabase/functions/webhook-asaas/index.ts` — mesma coisa para `PAYMENT_OVERDUE`.
- Não altera `_shared/dunning-whatsapp.ts` (já pronto).

## O que NÃO entra
- Dunning por Instagram/SMS (só WhatsApp).
- Retentativa Bacen PIX Automático — não temos escopo Bacen ativo, só Asaas.
- Novos templates Twilio — usa o `HXaf4af1e1f5d4cf40b6fff6b5b68df29a` já aprovado.

## Detalhes técnicos

Arquivos:
```text
supabase/functions/cancel-subscription/index.ts
  + handleAsaasPix() em paralelo a handleAsaasCard
  + roteamento por card_gateway === 'asaas_pix'

supabase/functions/execute-scheduled-tasks/index.ts
  + case 'asaas_pix_resume_subscription'

supabase/functions/stripe-webhook/index.ts
  + call sendDunningWhatsApp em invoice.payment_failed (attempt >= 2)

supabase/functions/webhook-asaas/index.ts
  + call sendDunningWhatsApp em PAYMENT_OVERDUE

src/pages/CancelSubscription.tsx
  + nota curta quando gateway === 'asaas_pix'
```

Sem migration nova. Tabelas usadas (`scheduled_tasks`, `dunning_attempts`, `retention_events`, `cancellation_feedback`) já existem.

## Riscos
- **Sub PIX antiga não cancelar após criar a nova**: best-effort + log; `reconcile-subscriptions` detecta duplicata.
- **Cliente não pagar o próximo QR pós-pausa/downgrade**: cai no fluxo de dunning normal (email + WhatsApp).
- **Dunning WhatsApp saturar cliente**: mitigado por (a) limite 2 envios/sub, (b) cadência atrás do 2º email, (c) dedup por event_id.

## Validação pós-deploy
- 1 usuário Asaas PIX de teste: `check → downgrade_to_lite` (confirma nova sub PIX 19.90), `check → pause 30d` (confirma sub cancelada + task de resume), `check → cancel`.
- Query `retention_events WHERE gateway='asaas_pix'` mostra eventos.
- Simular `invoice.payment_failed` no Stripe CLI → confirmar linha em `dunning_attempts` com `channel='whatsapp'` e `message_sid`.

## Ordem de execução
1. Auditar webhooks Stripe/Asaas para localizar pontos de invocação do dunning WhatsApp.
2. `cancel-subscription`: `handleAsaasPix` + roteamento.
3. `execute-scheduled-tasks`: handler PIX resume.
4. Webhooks: chamadas de `sendDunningWhatsApp` onde faltar.
5. Frontend: nota curta pro gateway PIX.
6. Typecheck + validação manual.

## Perguntas antes de implementar
1. **Dunning WhatsApp respeita quiet hours 22h-08h BRT?** O código atual diz "não respeita — é utility/transacional". Confirma manter assim, ou quer aplicar a janela de silêncio?
2. **Cadência WhatsApp**: disparar junto do 2º email (mais espaçado, menos atrito) ou junto do 1º (mais agressivo, converte mais rápido)?
