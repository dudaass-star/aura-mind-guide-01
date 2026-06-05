## Por que ela não aparece em /admin/users

A Marina pagou, mas **nunca virou `profile`** — o webhook do Stripe falhou em criar o registro. Por isso ela não aparece em nenhuma lista de usuários do admin.

## O que eu encontrei

**Identificação**
- Nome: marina da silva godoi
- Email: marinas.godoi@gmail.com
- Telefone: 11943960112 (sem 55+9 — número antigo de São Paulo)

**Banco (Supabase)**
- `profiles`: **0 registros** (nunca foi criada)
- `checkout_sessions`: 1 registro `completed` em **18/04/2026 14:51** — plano `direcao`, mensal, cartão, session `cs_live_a14qSGz3nUHZIw...`
- `cancellation_feedback`: 1 registro em **03/06/2026 16:54** com `action_taken='canceled'` e `user_id=NULL` — ou seja, o fluxo público de cancelamento gravou o feedback, mas **não cancelou nada no Stripe** (provavelmente o `cancel-subscription` não achou customer pelas variações de telefone — ela usou 11943960112, sem 9 extra).
- `support_tickets`: 1 ticket aberto `pending_review` `CANCELAMENTO` em 03/06/2026 16:56, sem `profile_user_id` (consistente).

**Stripe**
- Customer: `cus_UMIoUxvOnc794A`
- Subscription: `sub_1TNaDkQU15XnZ7VvZyJ6HlMh` — **ACTIVE**, AURA Direção mensal R$ 49,90, criada 18/04/2026, período atual termina ~22/06/2026.
- A assinatura está rodando há quase **2 meses** sem profile, e ela está reclamando com razão: pediu cancelamento em 25/04, ninguém cancelou, continuou sendo cobrada.

## Causa raiz

1. Webhook do Stripe não materializou o profile no onboarding (caso isolado a investigar depois — não é a prioridade agora).
2. Sem profile, `cancel-subscription` provavelmente buscou pelo telefone normalizado `5511999439601112` (com 9 extra) e não achou o customer no Stripe — daí o feedback ter ficado como "canceled" sem ação real.
3. O ticket veio para o admin mas como `profile_user_id` é null, o painel não mostra contexto.

## Plano de ação proposto

### Passo 1 — Cancelar a assinatura no Stripe (imediato)
Cancelar `sub_1TNaDkQU15XnZ7VvZyJ6HlMh` **com efeito imediato** (não no fim do período) — ela já pediu cancelamento há 40 dias e está reclamando de cobrança indevida. Faço via `stripe_api_write` (DeleteSubscriptionsSubscriptionExposedId).

### Passo 2 — Reembolsar cobranças pós-25/04
Listar invoices/charges desse customer a partir de 25/04/2026 e emitir refund total das que forem após o pedido de cancelamento. Confirmo com você o valor antes de executar.

### Passo 3 — Responder o ticket de suporte
Rascunho honesto em PT-BR no ticket:
- Reconhece a falha (cobrança indevida pós-pedido de cancelamento).
- Confirma o cancelamento da assinatura.
- Confirma o reembolso (valor e prazo Stripe ~5-10 dias úteis).
- Sem culpar sistema, sem detalhes técnicos.

### Passo 4 — Registrar caso em memória (opcional)
Anotar em `mem://features/payments/cancel-subscription-phone-mismatch` que `cancel-subscription` precisa tentar variações com **e sem** o 9 extra antes de marcar `action_taken=canceled` no feedback. Hoje gera feedback fantasma.

## Detalhes técnicos

- Cancelar via Stripe API: `DeleteSubscriptionsSubscriptionExposedId` com `subscription=sub_1TNaDkQU15XnZ7VvZyJ6HlMh`.
- Refund via `PostRefunds` com `charge=<id>` ou `payment_intent=<id>` por invoice.
- Não vou criar profile retroativo (não há ganho, ela está saindo).
- Não vou tocar no webhook do Stripe nessa rodada — escopo é resolver o caso.

## O que preciso de você

1. **Confirmo cancelar imediato + reembolsar todas as cobranças pós-25/04?** (recomendado)
2. Ou prefere cancelar imediato + reembolsar **só a última cobrança**?
3. Ou cancelar imediato **sem reembolso** (não recomendo — ela tem ticket com prints provando que pediu).
