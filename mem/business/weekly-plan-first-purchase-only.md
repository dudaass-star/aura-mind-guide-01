---
name: Semanal só na 1ª compra
description: Plano Semanal (R$ 6,90/9,90/19,90) é isca de aquisição — 1× por cliente. Retornantes bloqueados no create-checkout e redirecionados pro recorrente.
type: constraint
---
**Regra:** o fluxo `trial=true` no `create-checkout` bloqueia retornantes antes de criar a Session e responde 409 `WEEKLY_NOT_AVAILABLE_FOR_RETURNING`.

**Retornante =** qualquer um:
- `profiles` com mesmo email OU phone e `stripe_customer_id`/`asaas_customer_id`/`plan` preenchido.
- Stripe: `customers` (por email/phone) com **qualquer** subscription histórica (`status: 'all'`).
- Asaas: `asaas_payments` com status `CONFIRMED`/`RECEIVED`/`RECEIVED_IN_CASH` no `asaas_customer_id`.

**Frontend (`CheckoutV2.tsx`):** ao receber 409 com esse code, mostra toast, força `billingPeriod = "monthly"` e rola pro topo — sem quebrar o fluxo.

**Por quê:** Semanal foi desenhado como porta de entrada barata pra converter novos leads. Permitir recompra pra churners transforma em downgrade disfarçado e corrói LTV. Caso de referência: `jefmarper@gmail.com` (Direção mensal 05/26 → cancelou → voltou no Semanal 07/26).

**Fora do escopo:** não bloqueia quem criar email/telefone novo — o objetivo é higienizar o fluxo legítimo, não caçar abuso.