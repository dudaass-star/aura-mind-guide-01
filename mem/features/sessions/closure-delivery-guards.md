---
name: Travas de entrega no encerramento de sessão
description: 3 travas que evitam resumo/nota em cima da despedida, despedida truncada e fechamento sobre turno aberto
type: feature
---

Origem: sessão da Simone (22/08/2026, nota 3) — resumo+nota chegaram antes do fim da despedida, a fala final foi cortada por "Não sei" e o encerramento caiu em cima de turno aberto.

1. **Gate de entrega** (`session-reminder/dispatchPostSession`): antes de enviar resumo+nota, faz polling de `aura_response_state.is_responding` (até 20× 3s = 60s). Só dispara com `is_responding !== true`.
2. **Despedida imune a interrupção** (`process-webhook-message`): quando `agentData.session_ended === true`, a checagem de `last_user_message_id` entre bolhas é desativada — a despedida sai inteira.
3. **Não encerrar sobre turno aberto** (`aura-agent`, safety net de `[ENCERRAR_SESSAO]`): se a última mensagem do usuário é `não sei / sei lá / talvez` ou relato ≥160 chars, a trava de fechamento é suprimida naquele turno. Exceção: fase `overtime` sempre encerra (cap duro).
