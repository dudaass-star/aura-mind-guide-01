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

## Arquivos
- `supabase/functions/aura-agent/index.ts` — set flag (~5630), inject convite + clear (~5697)
