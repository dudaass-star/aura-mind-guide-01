---
name: Safety Net D0 — re-confirmação da 1ª sessão sem [AGENDAR_SESSAO:]
description: Micro-agente schedule-tag-extractor detecta quando a Aura confirmou a 1ª sessão verbalmente sem emitir tag e dispara re-confirmação proativa; NUNCA cria sessão silenciosamente
type: feature
---

## Escopo
Apenas o convite D0 da 1ª sessão (`profiles.pending_first_session_invite=true`). Reagendamento, setup mensal e sessões avulsas continuam tag-only.

## Princípio
O extractor **nunca escreve em `sessions`**. Apenas envia uma re-confirmação proativa ("Só pra confirmar: nossa sessão fica marcada pra <horário>?"). Quando o usuário responde "sim", o fluxo normal do `aura-agent` (regex `[AGENDAR_SESSAO:...]`) cria a sessão com `created_by='aura_tag'` ou `'extractor_reconfirm'` se quisermos rastrear (atualmente as sessões pós-extractor recaem em `'aura_tag'` porque a tag vem da Aura no turno seguinte).

## Arquitetura
`aura-agent` (linha ~6405) → após processar `[AGENDAR_SESSAO:]` → se `!scheduleMatch` E `pending_first_session_invite` E gates regex (aceite usuário + confirmação Aura) E lock livre → `await UPDATE profiles SET extractor_pending=true` (optimistic lock via `.eq('extractor_pending', false)`) → `EdgeRuntime.waitUntil(invoke schedule-tag-extractor)` → extractor (Gemini Flash-lite + tool calling, ultra-conservador) → `sendProactive` → libera lock no `finally`.

## Decisão crítica: `await` no lock
Mantemos `await` (não `Promise.all` fire-and-forget) porque sem ele dois turnos rápidos podem ler `extractor_pending=false` em paralelo e disparar dois extractors. Latência adicional ~100ms (≈3% do delay 1.5–3.5s já existente). Se o UPDATE falha, **abortamos o invoke** — melhor perder uma re-confirmação do que disparar duas.

## Lock TTL
`profiles.extractor_pending_at` permite expirar locks órfãos. O `aura-agent` considera o lock livre se `now() - extractor_pending_at > 10min`. O extractor sempre limpa no `finally`.

## Coluna de rastreio
`sessions.created_by` (default `'aura_tag'`, valores: `aura_tag` | `extractor_reconfirm` | `manual_admin`). Auditoria diária: contagem por `created_by`. Se `extractor_reconfirm > 20%` do total → reabrir investigação do prompt principal.

## Não-objetivos
- Não cobre reagendamento, setup mensal, sessão avulsa.
- Não cria sessão silenciosamente em nenhuma hipótese.
- Não troca modelo nem faz retry de LLM.

## Arquivos
- `supabase/functions/schedule-tag-extractor/index.ts` (novo)
- `supabase/functions/aura-agent/index.ts` (~linha 6405)
- migration `sessions.created_by` + `profiles.extractor_pending` / `extractor_pending_at`