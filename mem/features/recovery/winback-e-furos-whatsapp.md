---
name: Recuperação por WhatsApp — win-back e furos corrigidos
description: Causa-raiz do win-back nunca enviado (BOOT_ERROR), leitura nova de subscription no Stripe, modo degradado sem profile e fallback pós-falha Twilio
type: feature
---
- `winback-canceled-users` ficou meses com ZERO envios por **BOOT_ERROR**: o import `npm:@supabase/supabase-js@2.45.0` não bootava no edge runtime. Padrão do projeto é `https://esm.sh/@supabase/supabase-js@2.49.4`. Corrigido 07/08/2026 + entrada em `config.toml` (verify_jwt=false) + step no workflow de deploy.
- Testes da função: `{"dry_run":true}` lista elegíveis sem enviar; `{"only_user_id":"<uuid>"}` envia para um único usuário.
- Link do win-back é `https://olaaura.com.br/v2/checkout` (o `/checkout` é caminho morto).
- Stripe: `invoice.subscription` vem null na API nova. Ler também `invoice.parent.subscription_details.subscription`, senão renovações falhadas caem em `no_subscription_on_invoice` e nenhum dunning sai.
- Modo degradado (sem profile no banco): `sendDunningWhatsAppDegraded()` em `_shared/dunning-whatsapp.ts` envia só o template utility de aviso (sem escada de ofertas, pois não há portal token), com link do gateway (hosted_invoice_url / portal / invoice_url Asaas). Teto = DUNNING_NOTICE_STEPS por ciclo, contado por telefone.
- Falha de entrega Twilio (failed/undelivered no status callback): além de zerar `whatsapp_sent`, agenda retry do MESMO degrau para o dia seguinte 09h BRT (`scheduled_tasks.dunning_offer_whatsapp`) e dispara e-mail de dunning imediato.
- `dunning_attempts.offer_tier` agora é gravado em todo envio (generic / discount_30 / lite) para medir efetividade.
