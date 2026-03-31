

# Fase 2: Implementação Twilio WhatsApp API

O connector Twilio ja esta conectado (`TWILIO_API_KEY` disponivel). Voce tem o numero pronto.

## Passo 1: Solicitar secret `TWILIO_WHATSAPP_FROM`

Usar `add_secret` para voce inserir o numero no formato `whatsapp:+55XXXXXXXXXXX`.

## Passo 2: Migration — tabela `whatsapp_templates`

Criar tabela com 7 templates seedados (`is_active = false`), RLS para service_role + admins.

## Passo 3: Implementar `whatsapp-official.ts`

- `sendFreeText(phone, text)` — POST `/Messages.json` via gateway com `Body`
- `sendTemplateMessage(phone, templateName, variables)` — POST com `ContentSid` + `ContentVariables`
- Atualizar `sendProactiveMessage` para usar as funcoes reais

## Passo 4: Atualizar `whatsapp-provider.ts`

- `sendMessage` oficial → `sendFreeText`
- `sendAudio` oficial → log warning (base64 nao suportado)
- `sendAudioUrl` oficial → POST com `MediaUrl`

## Passo 5: Atualizar `.lovable/plan.md`

## Arquivos modificados

| Arquivo | Acao |
|---|---|
| Migration SQL | Novo — tabela `whatsapp_templates` + seed |
| `_shared/whatsapp-official.ts` | Reescrever com Twilio Gateway |
| `_shared/whatsapp-provider.ts` | Substituir placeholders |
| `.lovable/plan.md` | Marcar Fase 2 completa |

