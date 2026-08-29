---
name: Estágio 24h da recuperação WhatsApp
description: SID correto do template de 24h, trava anti-loop de falhas e regra de 34 caracteres para ContentSid
type: feature
---

Recuperação de checkout via WhatsApp (`recover-abandoned-checkout-whatsapp`), estágio 2 (24h):

- ContentSid correto: `HX50f03fdffb5195da970bdbfab08a2488` (`recuperacao_checkout_24hs`, MARKETING, aprovado, 1 variável = primeiro nome). Estágio 1 (15min): `HX6d9a0bda6dad14e72017547b0deb51ba`.
- Entre 21/08 e 29/08/2026 o SID no código estava truncado (33 chars) e a Twilio devolvia `20422 Invalid Parameter` em 100% dos envios do 2º contato — 13.953 tentativas. **Todo ContentSid tem 34 caracteres (HX + 32 hex); conferir o tamanho antes de trocar.**
- Falha de envio NÃO marca a coluna `whatsapp_recovery_*_sent_at`, então o cron de 5 min reprocessa o mesmo lead. Trava: `MAX_STAGE_FAILURES = 3` por registro/estágio numa janela de 3 dias (`stageFailureCount`) — depois disso o estágio é encerrado com `skipped: max_failures_N`.
- `invalid parameter` está em `INFRA_FAILURE_PATTERNS`, logo falha de configuração não banha o telefone no cap de 30 dias.
- `whatsapp_templates` guarda os mesmos SIDs (`checkout_recovery_wa_15min` / `checkout_recovery_wa_24h`) e deve ser atualizado junto com o código.
- Diagnóstico sem enviar: `debug-recovery-template` aceita `{"list_contents": true}` para listar todos os templates da subconta e `{"content_sids": [...]}` para ler corpo + aprovação Meta.
