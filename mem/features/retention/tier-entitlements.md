---
name: Entitlements dos tiers de retenção (Lite / Base)
description: profiles.plan_tier lite (R$19,90) e base (R$9,90) — limites aplicados no aura-agent e UI do portal
type: feature
---

`profiles.plan_tier` é a fonte de verdade dos tiers de retenção. `profiles.plan` continua `essencial`.

| Tier | Sessões | Áudio/mês | Mensagens |
|---|---|---|---|
| lite (R$ 19,90) | 1 (igual Essencial) | 900s (15 min) | ilimitadas |
| base (R$ 9,90) | 0 | 0 (bloqueio duro, sobrepõe decisões mandatórias) | 30/mês |

Ambos são **permanentes** (não expiram em 3 meses).

## Enforcement (`aura-agent/index.ts`)
- `planConfig.sessions` sobrescrito logo após `normalizePlan`.
- `budgetSeconds` = 0 (base) / 900 (lite); `budgetAvailable` exige `budgetSeconds > 0`.
- Bloco pós-`determineAudioMode`: base zera `shouldUseAudio` mesmo com `mandatory=true` (reason `tier_base_no_audio`).
- Cota base: colunas `profiles.messages_used_this_month`, `messages_reset_month`, `tier_limit_notified_month`.
  - Aviso em 24/30: bolha determinística enviada direto por `sendMessage` (Aura nunca faz upsell na conversa).
  - Parede em >30: retorna antes do LLM, envia 1 mensagem/mês + e-mail `plan-limit-reached`, libera `aura_response_state`.

## UI
`PlanTierBanner` em `src/pages/UserPortal.tsx`: barra de progresso 0-30 (base), resumo de limites (lite) e botão "Voltar ao Essencial" abrindo o `ChangePlanDialog`.
