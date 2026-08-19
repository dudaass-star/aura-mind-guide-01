---
name: Guarda Woovi na recuperação de checkout
description: Recuperação de checkout (WhatsApp e e-mail) ignora quem tem mandato/parcela Woovi, com checagem ao vivo, mantendo o gatilho em 15 min
type: feature
---

Caso real 19/08/2026: Isabella pagou PIX Automático Woovi às 10:27 BRT e recebeu o template de 15min às 10:45, porque a parcela do carnê não vem por webhook nem em `/api/v1/charge` — o perfil só nasceu 10:46:58.

- `supabase/functions/_shared/woovi-recovery-guard.ts`:
  - `loadWooviCommitmentSets` → sets de e-mail/telefone (30 dias) com mandato aprovado/ativo, `entry_paid_at`, `access_granted_at`, `mandate_approved_at` ou parcela paga em `woovi_charges`.
  - `hasLiveWooviCommitment` → checagem ao vivo (mandato local → `/api/v1/subscriptions/:id` → extrato `/api/v1/transaction`, match por CPF/e-mail/telefone nas últimas 48h). Falha de rede nunca bloqueia o envio.
- Usada em `recover-abandoned-checkout-whatsapp` (checkout_sessions `payment_method` começando com `pix` + candidatos Asaas) e em `recover-abandoned-checkout`.
- **O gatilho segue em 15 min** — nada de carência maior; o falso abandono se resolve pela checagem ao vivo.
- `woovi-pix-audit` aceita `{ "only": "extrato" }` (roda só a varredura 6) e tem cron `woovi-extrato-reconcile-10min` a cada 10 min, para o pagamento aparecer localmente em minutos.
