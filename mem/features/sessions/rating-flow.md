---
name: Envio e captura de rating pós-sessão
description: Rating usa categoria 'checkin' (sem prefixo), grava em messages para auditoria e captura aceita ⭐ + até 80 chars
type: feature
---

**Envio** (`session-reminder/index.ts`, bloco post-session):
- `sendProactive(phone, ratingMessage, 'checkin', userId)` — categoria `checkin` tem título vazio em `PROACTIVE_TITLES`, evitando o prefixo "Lembrete de sessão 🕐" que confundia usuárias achando que era lembrete da próxima sessão.
- Sucesso: persiste a mensagem em `public.messages` (role=assistant) para traceability e seta `rating_requested=true` + `post_session_sent=true`.
- Falha: registra em `failed_message_log` com `function_name='session-reminder/rating'`.

**Captura** (`process-webhook-message/handleSessionRating`):
- Aceita "5", "5 ⭐", "⭐ 5", "5/5", "nota 4", "dou/daria/dei 4", em mensagens até 80 chars.
- Só aplica se houver sessão `completed` + `rating_requested=true` nas últimas 24h sem rating prévio.
