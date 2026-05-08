---
name: Tags obrigatórias para agendar/reagendar sessão
description: Aura DEVE emitir [AGENDAR_SESSAO:YYYY-MM-DD HH:MM] ou [REAGENDAR_SESSAO:YYYY-MM-DD HH:MM] no final da resposta — sem a tag, nada é gravado no banco
type: feature
---

O handler em `aura-agent/index.ts` (~linha 6042) só atualiza `sessions.scheduled_at` (reagendar) ou cria nova sessão (agendar) via REGEX literal sobre a resposta da Aura. Não há extrator NLP a posteriori.

Tags válidas:
- `[REAGENDAR_SESSAO:YYYY-MM-DD HH:MM]` → atualiza próxima sessão `scheduled` do usuário
- `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]` → cria nova sessão
- `[SESSAO_PERDIDA_RECUSADA]` → marca sessão perdida como recusada

Sem a tag, a Aura confirma verbalmente mas o banco não muda — é uma promessa vazia (bug histórico Larissa Dorneles, 22/04/2026).

O prompt em `aura-agent/index.ts` na seção `# SESSÕES` já documenta as tags com exemplos. NUNCA remover essa documentação do prompt sem antes implementar um extrator NLP separado para a intenção.

Validação: log `📅 Session rescheduled via AURA` deve aparecer sempre que houver reagendamento real.

## Safety Net D0 (exceção controlada)
Apenas para o convite D0 da 1ª sessão (`pending_first_session_invite=true`), existe uma rede de segurança que dispara o micro-agente `schedule-tag-extractor` se a Aura confirmar verbalmente sem emitir tag. O extractor **não cria sessão** — apenas envia uma re-confirmação proativa para que o usuário responda "sim" e o fluxo normal de tag aconteça no turno seguinte. Ver `mem://features/sessions/safety-net-d0`.
