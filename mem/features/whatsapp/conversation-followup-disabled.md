---
name: Follow-ups automáticos de conversa comum desativados
description: conversation-followup só envia em sessão formal ativa; ping-pong/casual nunca recebe nudge "ei, você sumiu?" pra não soar forçado
type: feature
---

Decisão jun/2026: follow-ups automáticos depois de 15 min sem resposta em conversa comum foram desativados.

## Por quê
Caso Eduardo (03/06): Aura terminou conversa sobre febre/filha com pergunta normal ("A febre deu uma trégua?"). 19 min depois, `conversation-followup` extraiu contexto da conversa toda (que misturava sessões + febre) e disparou "E aí, tudo certo com os agendamentos? 😉 Adoraria saber se deu certo!". Saiu forçado, ansioso e descolado do contexto real. O problema é o mecanismo, não a frase.

## Regra atual
- `process-webhook-message` só registra `last_user_message_at` quando `session_active=true`. Conversa comum em `awaiting` NÃO arma follow-up.
- `conversation-followup` tem guarda extra: se `profile.current_session_id` for null, pula e neutraliza o registro (`followup_count=99`).
- Sessões formais (45 min) continuam recebendo follow-up — ali a retomada faz sentido.

## O que NÃO foi tocado
- Lembretes de sessão agendada (`session-reminder`).
- Tarefas explícitas do usuário (`[AGENDAR_TAREFA]`).
- Check-ins proativos (`scheduled-checkin`), pergunta semanal, cápsula do tempo, relatórios.

## Princípio
Aura deixa ping-pong morrer naturalmente. Silêncio do usuário em conversa casual = conversa fechou. Não persegue.