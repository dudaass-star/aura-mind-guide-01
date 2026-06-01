## Contexto factual (Stripe)

- Customer: `cus_UMf3wZDSC6HrTm` (Mayle Carla Coelho Pinto, dramaylecoelho@gmail.com)
- Subscription: `sub_1TNvjNQU15XnZ7VvhAQakYCf` — plano Transformação mensal R$ 79,90
- Criada: 19/abr/2026 • Trial: 19/abr → 26/abr • 1ª cobrança: 26/abr
- Última cobrança: **26/mai/2026** (invoice `in_1TbLN6QU15XnZ7VvbrWmYqpB`, payment_intent `pi_3TbMJWQU15XnZ7Vv1sKbKeoa`, R$ 79,90)
- Status atual: `active`, `cancel_at_period_end=false`, `canceled_at=null` → **assinatura NÃO foi cancelada**
- Sem perfil no banco (nunca conectou WhatsApp ou perfil foi limpo); ação tem que ser direto no Stripe

O rascunho atual da IA está com 4 erros factuais (data da última cobrança, mês de início, "cancelamento confirmado", "acesso até 24/mai") e violou a memória `support — cancellation-retention` (confirmou cancelamento na 1ª resposta).

---

## Parte 1 — Ação no ticket (one-off, via tools Stripe)

1. **Refund de R$ 79,90 na invoice de 26/mai**
   - `stripe--create_refund` em `pi_3TbMJWQU15XnZ7Vv1sKbKeoa`, reason `requested_by_customer`, amount completo (7990 BRL minor).
2. **Cancelar a subscription imediatamente** (cliente pediu cancelamento + estorno, não pediu manter acesso)
   - `stripe--cancel_subscription` em `sub_1TNvjNQU15XnZ7VvhAQakYCf`.
3. **Regenerar o rascunho do ticket** no painel /admin/support
   - Opção A (preferida): clicar "regenerar" com hint no painel após eu confirmar refund+cancel. O support-agent vai reler o contexto Stripe atualizado e gerar resposta correta.
   - Opção B: se preferir, eu escrevo aqui o texto e você cola.

Eu executo (1) e (2) via tools Stripe (vão pedir confirmação humana), depois te aviso para regenerar (3) no painel — ou já redigir o texto novo aqui, como você preferir.

---

## Parte 2 — Causa raiz no support-agent (fix de prompt + contexto)

Erros do LLM vieram de duas falhas no `supabase/functions/support-agent/index.ts`:

**A. Contexto Stripe enviado em formato cru (Unix epoch + centavos), sem campos críticos**

Hoje em `context.stripe` (linhas 203-217) mando apenas:
- `current_period_end` como Unix
- `amount` em centavos
- não mando `created` da subscription, `trial_start`, `trial_end`, `canceled_at`, nem `created` formatado das invoices

→ LLM tem que inferir datas legíveis e termina alucinando ("março", "24 de abril", "24 de maio").

**Fix:** enriquecer `context.stripe` com strings ISO BRT pré-formatadas:
- Para cada subscription: `created_at_brt`, `trial_start_brt`, `trial_end_brt`, `current_period_start_brt`, `current_period_end_brt`, `canceled_at_brt`, `is_active_now` (boolean derivado de `status==='active'/'trialing' && !cancel_at_period_end`).
- Para cada invoice: `created_at_brt`, `amount_paid_brl` (já dividido por 100 com símbolo).
- Manter os campos Unix originais para auditoria.

**B. Prompt não trava "afirmar fato que requer ação não executada"**

Hoje o prompt diz "não prometa reembolso/cancelamento baseado só no que o cliente afirmou" mas não diz "**não afirme no corpo que a assinatura foi cancelada / o reembolso foi feito a menos que `suggested_action.type` seja `cancel_subscription` / `refund_invoice`**". O LLM gerou texto declarando cancelamento mesmo com `suggested_action=none`.

**Fix:** adicionar bloco no SYSTEM_PROMPT:
```
REGRA DE CONSISTÊNCIA AÇÃO×TEXTO (inviolável):
- Se suggested_action.type = "none", o draft NÃO pode afirmar que algo foi feito ("cancelei", "reembolsei", "confirmei o cancelamento", "garantimos que não haverá cobrança"). Apenas pode dizer o que VAI fazer após confirmação.
- Se subscription.is_active_now = true E suggested_action.type != "cancel_subscription"/"cancel_asaas_subscription", PROIBIDO escrever que a assinatura está/foi cancelada.
- Datas no corpo do email DEVEM vir dos campos *_brt do contexto. PROIBIDO inferir datas de timestamps Unix ou inventar meses.
```

**C. (Opcional, mas recomendado) Validação server-side antes de enviar**

Em `supabase/functions/support-send-reply/index.ts` (ou no fluxo de save do draft), adicionar lint simples: se draft contém regex `/cancel(ei|amos|ado|amento confirmado)/i` e a subscription do customer ainda está `active` sem `cancel_at_period_end`, marcar ticket como `needs_human_review` e bloquear auto-send. Esse passo não muda comportamento de aprovação manual, só evita auto-send acidental.

---

## Arquivos tocados (Parte 2)

```text
supabase/functions/support-agent/index.ts
  - enriquecer context.stripe com campos *_brt e is_active_now (linhas ~203-217)
  - adicionar bloco "REGRA DE CONSISTÊNCIA AÇÃO×TEXTO" no SYSTEM_PROMPT (linhas ~30-65)
  - helper local fmtBRT(unixSec): string usando Intl.DateTimeFormat com timeZone 'America/Sao_Paulo'

supabase/functions/support-send-reply/index.ts  (opcional, item C)
  - regex de coerência draft × estado da subscription antes de enviar

mem/features/support/cancellation-retention-and-privacy.md
  - registrar regra de consistência ação×texto e formato BRT obrigatório
```

Não toco em UI/painel, edge functions de billing, nem RLS.

---

## Ordem de execução (após você aprovar)

1. Refund (`pi_3TbMJWQU15XnZ7Vv1sKbKeoa`) — confirmação humana via tool Stripe.
2. Cancel subscription (`sub_1TNvjNQU15XnZ7VvhAQakYCf`) — confirmação humana via tool Stripe.
3. Patch no `support-agent/index.ts` (contexto BRT + regra de consistência).
4. Patch opcional no `support-send-reply/index.ts` (lint de coerência).
5. Atualizar memória de retenção com a nova regra.
6. Te aviso para regenerar o rascunho no painel (ou colo o texto correto aqui).
