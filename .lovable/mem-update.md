---
name: Detecção determinística de cliques em templates
description: Cliques em templates Quick Reply são identificados via MessageType=button + ButtonText + OriginalRepliedMessageSid; resolução de conteúdo via tabela template_definitions
type: feature
---

# Detecção determinística de cliques (Twilio Quick Reply)

Substitui a heurística antiga de "janela curta + regex de aceite" no `process-webhook-message`.

## Como funciona

1. `webhook-twilio` propaga ao worker: `messageType`, `buttonText`, `buttonPayload`, `originalRepliedMessageSid`.
2. Se `messageType === 'button'`:
   a. Lookup em `template_definitions` por `button_text` (ILIKE) → obtém `delivers_content_type`.
   b. Match do registro pendente em `weekly_questions` / `monthly_letters` por `trigger_message_sid = OriginalRepliedMessageSid`.
   c. Fallback: registro mais recente do usuário sem `delivered_at` dentro de 24h (cobre templates legados sem SID gravado).
   d. Entrega o conteúdo (texto livre), marca `delivered_at`, retorna ANTES de chamar o aura-agent.
3. Senão → fluxo normal.

## Tabela `template_definitions`

Fonte canônica de "qual template entrega qual conteúdo". Adicionar novo template = só inserir linha. Seed atual:
- `pergunta_semanal` → `Ver pergunta` → `weekly_question`
- `carta_mensal` → `Acessar` → `monthly_letter`

## Captura de SID

`sendTemplateOnly` (whatsapp-official) propaga `messageId` no `ProactiveMessageResult`. Callers (`send-weekly-question`, `generate-monthly-letter`) gravam em `trigger_message_sid` da tabela do conteúdo.
