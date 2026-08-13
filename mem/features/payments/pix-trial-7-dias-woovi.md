---
name: Trial pago de 7 dias no PIX Automático Woovi
description: Entrada promocional (6,90/9,90/19,90) compra 7 dias; 1º débito cheio do mandato cai no dia 8 (D+7), não em D+30
type: feature
---
Regra vigente (substitui a janela de 30 dias descrita em `mem/features/payments/pix-trial-semanal.md`):

- `criar-pix-recorrente-woovi` (jornada composta, mensal, cliente novo): mandato ONLY_RECURRENCY com valor cheio e `dayGenerateCharge = hoje + 7 dias` (`TRIAL_DAYS`); `next_charge_date` também D+7. Sem trial (nativo Jornada 3) segue debitando na aprovação.
- `webhook-woovi`: `activateAccess({ trialEntry })` — quando a cobrança paga é a entrada (`entry_charge_correlation_id`) de um mandato `is_trial`, `plan_expires_at = base + 7 dias` e `next_charge_date = hoje + 7`. O débito do dia 8 estende para o ciclo mensal cheio (renovação, não venda nova).
- UI: `CheckoutV2.tsx` já mostra a data de `firstRecurringChargeDate`, então o modal do QR exibe o dia 8 e a copy "1ª semana" fica verdadeira.
- Mandatos autorizados antes de 13/08/2026 continuam com o 1º débito em D+30 — a mudança vale só para QRs novos.
