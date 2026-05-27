# Restaurar envio da Aura via Twilio

## Causa raiz (confirmada com evidência)

A flag `system_config.whatsapp_provider` foi alterada para `'meta'` (provavelmente ontem ao configurar o número novo). A função `sendMessage()` lê essa flag e roteia **todo envio da Aura** para `meta-whatsapp-client.ts` → `graph.facebook.com/{META_WHATSAPP_PHONE_NUMBER_ID}/messages`.

A Meta rejeita 100% das tentativas com:
```
400 — (#131037) WhatsApp provided number needs display name approval before message can be sent.
```

Evidência: sua mensagem 01:16:33 hoje (telefone `555181519708`) → falha logada em `failed_message_log` com `function_name=process-webhook-message`. Mesmo padrão se repete em ~30 usuários nas últimas 48h.

O recebimento via `webhook-twilio` continua funcionando (por isso as mensagens entram), mas o envio nunca chega no WhatsApp do usuário.

## A correção

Uma única migration:

```sql
UPDATE system_config 
SET value = '"official"', updated_at = now()
WHERE key = 'whatsapp_provider';
```

## Efeito imediato

- `sendMessage()` volta a rotear pra `whatsapp-official.ts` → Twilio Gateway → `+16625255005`
- Próxima mensagem sua chega normalmente
- Templates, recovery, dunning, Instagram — nada muda
- Integração Meta no código continua existindo (dormente) até você terminar a aprovação do display name; quando estiver pronta, basta virar a flag de volta

## O que não vou tocar

- Secrets `META_*` ficam onde estão
- `meta-whatsapp-client.ts`, `webhook-meta`, `qa-meta-*` permanecem no código
- Nenhum código TypeScript precisa mudar
