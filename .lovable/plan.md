

# Fase 1: Preparação para API Oficial do WhatsApp

## Status: ✅ Completo

- Migration `last_user_message_at` aplicada
- `whatsapp-official.ts` criado com 7 templates (5 utility + 2 marketing)
- `whatsapp-provider.ts` criado com abstração zapi/official
- `webhook-zapi` atualizado para gravar `last_user_message_at`
- Config `whatsapp_provider = 'zapi'` inserida

# Fase 2: Implementação Twilio Gateway

## Status: ✅ Completo

- Tabela `whatsapp_templates` criada com 7 templates seedados (is_active = false)
- RLS: service_role full access + admins read
- `sendFreeText()` implementado via Twilio Gateway `/Messages.json`
- `sendTemplateMessage()` implementado com ContentSid + ContentVariables
- `sendProactiveMessage()` atualizado: janela aberta → freetext, fechada → template + split
- `sendAudioFromUrl()` implementado via MediaUrl
- `whatsapp-provider.ts` atualizado: todos os placeholders substituídos
- Secret `TWILIO_WHATSAPP_FROM` configurado

## TEMPLATE_MAP Final (7 templates)

| Categoria | Template | Meta | Função |
|---|---|---|---|
| `checkin` | `aura_checkin` | Utility | `scheduled-checkin` (7 dias inativo) |
| `content` | `aura_content` | Utility | `periodic-content` (Ter/Sex) |
| `weekly_report` | `aura_weekly_report` | Utility | `weekly-report` (Dom 19h) |
| `insight` | `aura_insight` | Utility | `pattern-analysis` (Qui/Sáb) |
| `session_reminder` | `aura_session_reminder` | Utility | `session-reminder` |
| `reactivation` | `aura_reactivation` | Marketing | `reactivation-check`, `reactivation-blast` |
| `checkout_recovery` | `aura_checkout_recovery` | Marketing | `recover-abandoned-checkout` |

## Sem template (janela 24h)

- `conversation-followup`, `send-meditation`, `aura-agent`, `deliver-time-capsule`, `scheduled-followup`

## Custo estimado: ~R$ 2.73/usuário/mês

# Fase 3: Ativação (pendente)

Para ativar a API Oficial:
1. Cadastrar templates no Twilio Console e obter Content SIDs
2. Atualizar `twilio_content_sid` e `is_active = true` na tabela `whatsapp_templates`
3. Mudar `whatsapp_provider` para `'official'` em `system_config`
