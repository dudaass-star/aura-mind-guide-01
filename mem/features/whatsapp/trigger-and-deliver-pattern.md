---
name: Padrão Trigger + Deliver para conteúdo rico
description: Conteúdo rico (Pergunta da Semana, Carta Mensal, Jornadas, Resumo Semanal) usa padrão template-gatilho + entrega determinística por clique no botão
type: feature
---
Conteúdo rico proativo (Pergunta da Semana, Carta Mensal, Jornadas, Resumo Semanal/Mensal) sempre usa o padrão **Trigger + Deliver via clique de botão**:

1. **Trigger**: dispara um template fixo aprovado (Quick Reply) com botão único.
2. **Deliver determinístico**: ao clicar no botão, o webhook Twilio chega como `MessageType === 'button'` + `OriginalRepliedMessageSid`. O `process-webhook-message` (handler `isButtonClick`) entrega o conteúdo SEM chamar a Aura/LLM e retorna imediatamente.

**Cobertura atual do fast-path determinístico em process-webhook-message**:
- **Pergunta da Semana** → match por `weekly_questions.trigger_message_sid` (preciso) + fallback 24h. Mapeado em `template_definitions` (button_text="Ver pergunta").
- **Carta Mensal** → match por `monthly_letters.trigger_message_sid` + fallback 24h. Mapeado em `template_definitions` (button_text="Acessar").
- **Jornadas + Resumo Semanal** → fallback por `profiles.pending_insight` com prefixo `[CONTENT]` ou `[WEEKLY_REPORT]`. Não precisa de `template_definitions` porque o vínculo é o próprio pending_insight setado no momento do disparo.

**Após entrega**:
- Salva mensagem em `messages` (role=assistant), limpa `pending_insight`, atualiza `last_content_sent_at`, libera `aura_response_state`.
- Retorna 200 imediato — `aura-agent` nunca é invocado para cliques cobertos.

**Templates fora do fast-path** (caem em conversa livre):
- `cheking_7dias` → reativação, intenção é abrir conversa, não entregar conteúdo.
- `aura_welcome_v2`, `aura_reconnect_v2`, `aura_session_reminder_v2` → conversacionais.
