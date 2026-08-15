---
name: Rede de segurança do welcome
description: welcome-safety-net (cron horário) reenvia o welcome de clientes ativos com [WELCOME] pendente e welcome_sent_at nulo; profiles.welcome_sent_at é a prova de entrega
type: feature
---
`profiles.welcome_sent_at` é gravado por `_shared/welcome-delivery.ts` (`sendWelcomeWhatsApp`), usado por todos os webhooks de pagamento (Woovi, Inter, Asaas, Stripe). Falhas vão para `failed_message_log`.

`welcome-safety-net` roda no minuto 17 de cada hora: perfis criados nos últimos 5 dias, status active/trial, `welcome_sent_at IS NULL` e `pending_insight` começando com `[WELCOME]`. Se já houver mensagens trocadas, só marca `welcome_sent_at`; senão reenvia o template.

Aceita `{"dry_run": true}` para inspecionar sem enviar.
