---
name: Pausas do agente de recuperação não silenciam quem quer entrar
description: escalated_email é pausa temporária (6h), reabertura usa inbound anterior, e pedido de experimentar fura qualquer pausa nossa
type: feature
---

No `recovery-agent`:

- `HARD_PAUSES` = apenas `user_requested_human` e `lead_declined`. Pausa definitiva só quando a própria pessoa pede pra parar ou recusa.
- `escalated_email` (pergunta fora da base → e-mail do suporte) é pausa TEMPORÁRIA: vale 6h contadas de `last_bot_reply_at`. Depois disso a pausa é limpa e o agente volta a atender.
- Reabertura de conversa (48h) NÃO pode usar `recovery_conversations.last_inbound_at`: o `webhook-twilio-recovery` grava o inbound novo antes de invocar o agente. Usar o inbound ANTERIOR (`recovery_messages`, `.range(1,1)`) ou `last_bot_reply_at`.
- Fast-path de taster: se `classifyTasterIntent(text)` ou `wantsSingleSessionNow(text)` casar, ignorar pausas nossas e `limit_reached` e seguir direto para a oferta do encontro guiado de R$ 6,90.

**Por quê:** o lead Lu (5521972786432) clicou em "Quero experimentar" em 10/09 e ficou sem resposta porque uma escalada de e-mail de 04/09 travou a conversa pra sempre, e o reset de 48h era código morto.
