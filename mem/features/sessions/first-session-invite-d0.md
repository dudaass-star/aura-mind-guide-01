---
name: Convite à 1ª sessão no D0 (fisgar trial)
description: Após o WELCOME ser entregue, a próxima mensagem do usuário dispara automaticamente um convite à 1ª sessão (45min, tema livre) — Aura emite [AGENDAR_SESSAO:<agora>] e o backend ativa via [SESSION_PREARM]
type: feature
---

## Objetivo
Fisgar o usuário no D0 do trial de 7 dias com o produto-âncora (sessão), evitando o "mapeamento" longo de onboarding antes de provar valor.

## Fluxo
1. `start-trial` salva `pending_insight = [WELCOME]...` no profile.
2. Quando o usuário clica "Começar" no template, `aura-agent` entrega o WELCOME (linha ~5613) e marca `profiles.pending_first_session_invite = true`.
3. Na PRÓXIMA mensagem do usuário, `aura-agent` (linha ~5697) detecta a flag, limpa imediatamente, e injeta `dynamicContext` instruindo a Aura a:
   - Acolher brevemente o que ele disse
   - Convidar para sessão de 45min com tema livre AGORA
   - Se aceitar → emitir `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]` (horário atual BRT) → backend cria sessão → `[SESSION_PREARM]` ativa início imediato (ver `mem://features/session-prearm-flow`)
   - Se recusar → pergunta aberta sobre horário; quando responder, emite `[AGENDAR_SESSAO:...]`
   - Se desconversar → NÃO insistir
4. Reusa 100% da infra existente de agendamento (`mem://features/sessions/scheduling-tag-contract`). Sem micro-agent novo.

## Por que Aura agente (não micro-agent)
A decisão é simples ("1ª resposta após WELCOME = convidar") e síncrona. Micro-agents só fazem sentido para extração estruturada async (scheduling-extractor, session-extractor). Padrão dominante: backend detecta gatilho → injeta `PHASE_INSTRUCTIONS` → Aura emite tag → backend executa.

## Coluna
`profiles.pending_first_session_invite boolean default false` (migration 2026-05-05).

## Precedência sobre setup mensal
Vale para TODOS os planos (Essencial, Direção, Transformação). Enquanto `pending_first_session_invite=true`, o bloco de `needs_schedule_setup` (configurar 4/8 sessões da semana) NÃO é injetado no prompt — senão a Aura mistura os fluxos e nunca emite `[AGENDAR_SESSAO:...]` para a 1ª sessão D0. O setup mensal volta a ativar naturalmente depois que a flag é consumida.

## Contrato de tag obrigatório
O prompt do convite D0 exige explicitamente que a Aura termine a resposta com `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]` ao receber qualquer aceite ("sim", "bora", "vamos", "agora", etc.). Sem a tag, o backend não cria sessão (ver `mem://features/sessions/scheduling-tag-contract`) — incidente recorrente antes do reforço (Alexandre/Adriana, 06-07/05/2026).

## Anti-race do fast-path (08/05/2026 — Anderson Costa)
- O bloco D0 só é injetado se `message` for fala real do usuário (>0 chars e não cliques curtos como "Começar"/"Bora"/"Sim"/"Ok"). Isso evita que um turno paralelo do worker, disparado logo após o fast-path do WELCOME, queime a flag antes do usuário escrever de fato.
- A flag `pending_first_session_invite` NÃO é limpa quando o bloco é injetado. A limpeza ocorre só pós-resposta, em duas condições: (a) `[AGENDAR_SESSAO:` foi emitido pela Aura (aceite consumado) ou (b) `first_session_invite_attempts >= 3` (anti-loop, usuário desconversou).
- Coluna `profiles.first_session_invite_attempts int default 0` controla o anti-loop. Incrementada a cada turno em que o bloco D0 é injetado.

## Arquivos
- `supabase/functions/aura-agent/index.ts` — set flag (~5630), inject convite + clear (~5697)
