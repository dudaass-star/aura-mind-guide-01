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
- **Twilio 63027 nos avisos 1 e 2 — causa real (07/08/2026)**: 63027 é "Template does not exist for a language and locale", NÃO variável malformada. Teste controlado com `{{2}}` = só o token continuou falhando: o template `HXaf4af...` (`aura_recuperacao_semanal1`, aprovado, pt_BR) não existe para o sender atual `+19123014009`. Os templates de oferta (`dunning_offer_30`, `dunning_offer_lite`), registrados com nome + sufixo do SID, entregam normalmente. Passar só o token em `{{2}}` continua correto, mas não era a causa.
  - Substituto criado e submetido: `dunning_notice_v2` = `HX68e8ebce4c2ca1750a12ee20e4d2892a` (UTILITY, pt_BR, botão `/pagamento?t={{2}}`). Quando o Meta aprovar, gravar em `system_config` a chave `dunning_notice_content_sid` com o SID — o helper lê de lá e sobrepõe a constante, sem deploy.
  - Enquanto o aviso não entrega, o ciclo não fica silencioso: no status callback com ErrorCode 63027, `webhook-twilio-recovery` escala na hora para `attempt_number >= 3` (primeiro degrau de oferta) em vez de repetir o mesmo aviso no dia seguinte.
  - Diagnóstico de template/mensagem/envio de teste: função `debug-recovery-template` (`content_sids`, `message_sids` com alerts, `test_send`, `create_template`).
- **Status callback pode chegar antes do insert do attempt**: `webhook-twilio-recovery` relê `dunning_attempts` por `message_sid` até 4× (1,5s) antes de marcar falha/agendar retry — sem isso nenhum `retry-*` era criado e envios falhos ficavam marcados como entregues.
- **`reprocess-dunning`**: no branch `profile_not_found` agora tenta WhatsApp degradado (telefone do metadata do customer + `hosted_invoice_url`/billing portal) antes de só logar.
- **Modo degradado (sem profile)**: não há portal token, então o helper cria um `short_links` (TTL 168h) para a URL do gateway e manda o CÓDIGO em `{{2}}`. `customer-portal` resolve códigos de short_link (`provider: "short_link"`) e `/pagamento` redireciona. `create-short-link` aceita `ttl_hours` e libera domínios `invoice.stripe.com`, `pay.stripe.com`, `asaas.com`.
- **`no_subscription_on_invoice` não é mais fim de linha**: no `stripe-webhook`, antes do return, tenta WhatsApp degradado (telefone do customer) + e-mail com `hosted_invoice_url`/billing portal.
