---
name: Trial semanal no PIX Automático Bacen
description: PIX Automático mensal cobra 1ª semana promocional (690/990/1990) no QR imediato e autoriza o débito cheio a partir do D+7; bloqueado para retornantes
type: feature
---

Regra vigente (substitui `mem/business/trial-only-on-card.md` no ponto do PIX):

- Mensal: QR imediato cobra o trial (Essencial 6,90 · Direção 11,90 · Transformação 24,90) e a autorização Bacen já vale o valor cheio, com `startDate = hoje + 7`. Ver `mem/features/payments/pix-trial-7-dias-woovi.md` para o trilho Woovi vigente (débito no dia 8).
- Trim/Sem/Anual: sem trial, valor cheio à vista + recorrência.
- Retornante (profile existente, pagamento Asaas anterior ou assinatura Stripe) não recebe trial — `isReturningCustomer` em `criar-pix-recorrente-asaas` derruba pro valor cheio silenciosamente.
- Degradação: se o Asaas recusar o formato trial (valor imediato ≠ recorrente), a função repete a criação com valor cheio e `startDate` hoje.
- `webhook-asaas` marca `is_trial` no pagamento (tolerância R$ 0,50 contra `trial_value_cents`) e ativa com 7 dias de `plan_expires_at`; o débito do D+7 estende o ciclo mensal normal.
- UI: `CheckoutV2.tsx` mostra o mesmo "hoje R$ 6,90 · depois R$ 29,90/mês" nos dois meios; o modal do QR repete o aviso do débito futuro.