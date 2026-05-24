---
name: Recuperação carrinho WhatsApp subaccount
description: Fluxo paralelo ao e-mail (15min + 24h) via subaccount Twilio dedicada, isolado do número da Aura
type: feature
---

Recuperação de carrinho abandonado via WhatsApp roda em paralelo ao fluxo de 3 e-mails (1h/25h/97h).

- Edge function: recover-abandoned-checkout-whatsapp (cron */5 * * * *, job recover-abandoned-checkout-whatsapp-5min).
- Helper: supabase/functions/_shared/twilio-recovery-client.ts (REST direto Basic Auth na subaccount, fora do connector e fora do número da Aura).
- Secrets: TWILIO_RECOVERY_ACCOUNT_SID, TWILIO_RECOVERY_AUTH_TOKEN, TWILIO_RECOVERY_FROM.

Estágios: (1) 15min ContentSid HX7ae71f9002839ec0ecdc58f6aa067a8a, (2) 24h ContentSid HXb34b27fda2f45a0c10fc19960bac61c1 (só dispara após estágio 1).
ContentVariables: {{1}} primeiro nome, {{2}} plano, {{3}} link CTA https://olaaura.com.br/checkout?plan=...&utm_source=whatsapp&utm_medium=recovery&utm_campaign=wa_stage{1|2}_{15min|24h}.

Governança: quiet hours 22h-08h BRT bloqueia envio; pula clientes status active/trial via pré-busca de profiles + getPhoneVariations; marca whatsapp_recovery_{15min|24h}_sent_at para idempotência; loga em checkout_recovery_attempts (wa_stage_{1|2}_{sent|failed|skipped}). Não toca em recover-abandoned-checkout (e-mail) nem em whatsapp-official.ts.

Cutoff de ativação: constante WHATSAPP_RECOVERY_CUTOFF (2026-05-24T00:00:00Z) aplicada via `.gte("created_at", ...)`. Backlog anterior foi marcado em massa com whatsapp_recovery_{15min|24h}_sent_at=now() e whatsapp_recovery_last_error='skipped: backlog_pre_cutoff' para ficar fora do fluxo — recebem apenas e-mail. Se o cutoff for movido no futuro, refazer o backfill antes do deploy.
