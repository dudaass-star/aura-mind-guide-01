# Diagnóstico — Por que o áudio não veio

Eduardo mandou às 23:41 BRT: **"Tudo bem. Vc pode me mandar um áudio por favor?"**

A Aura respondeu em **texto**: "Oi, Eduardo... claro que mando, é bom falar com você! Me conta..."

Investiguei o fluxo e encontrei **2 bugs distintos**, ambos cirúrgicos.

---

## Bug 1 — Pedido explícito de áudio é ignorado se o LLM não emitir a tag

**Arquivo:** `supabase/functions/aura-agent/index.ts`, linhas **3622-3623** (função `splitIntoMessages`).

Código atual:
```ts
const isAudioMode = audioDecision.mandatory
  || (wantsAudioByTag && audioDecision.shouldUseAudio);
```

O `determineAudioMode` (linha 1517) detecta corretamente o pedido do usuário e retorna:
```
{ shouldUseAudio: true, reason: 'user_requested', mandatory: false }
```

Mas `splitIntoMessages` só liga o modo áudio quando `mandatory === true` **OU** quando o LLM colocou `[MODO_AUDIO]` no início da resposta. Como `user_requested` tem `mandatory:false` e o Flash quase nunca emite a tag espontaneamente, **o áudio nunca dispara em pedido explícito do usuário**.

**Fix (1 linha):**
```ts
const isAudioMode = audioDecision.mandatory
  || audioDecision.reason === 'user_requested'
  || (wantsAudioByTag && audioDecision.shouldUseAudio);
```

Agora qualquer pedido detectado pelas frases/regex do `userWantsAudio` (linha 3112) força o áudio, independente da tag.

---

## Bug 2 — `ReferenceError: sessionSummary is not defined` no fechamento de sessão

**Arquivo:** `supabase/functions/aura-agent/index.ts`, bloco linhas **~7380-7460**.

Log capturado às 23:42:35:
```
❌ aura-agent attempt 1 failed (Agent HTTP 500: ... "error":"sessionSummary is not defined")
ReferenceError: sessionSummary is not defined
    at file:///.../aura-agent/index.ts:6852:18
```

O bloco "ENVIO IMEDIATO DO RESUMO" (linhas 7388-7455) referencia 3 variáveis que **não existem mais no escopo local** (`sessionSummary`, `keyInsights`, `commitments`). Elas foram removidas quando a extração migrou para o micro-agent assíncrono `session-extractor` (refator documentado em `mem://technical/session/data-integrity-and-ratings`).

O `session-extractor` + `session-reminder` (fast-path imediato) já cuidam de enviar resumo + rating — log confirma:
```
⚡ Fast-path post-session imediato para sessão ...
✅ Post-session complete for session ... (rating: true)
```

**Fix:** remover o bloco morto `if (profile.phone && sessionSummary) { ... }` inteiro (linhas ~7388-7455) e o `summary: sessionSummary.substring(0, 50)` no log da linha 7382 (substituir por `'(extraído async)'`).

Isso elimina o erro 500 que está fazendo o aura-agent cair em retry/fallback em todo encerramento de sessão.

---

## Validação

1. Deploy `aura-agent`.
2. Eduardo (ou eu, simulando) manda **"me manda um áudio"** → log deve mostrar `decision: user_requested` e `has_audio: true`.
3. Encerrar uma sessão → log NÃO deve mostrar `sessionSummary is not defined`; resumo continua chegando via `session-reminder` (fast-path).

## Escopo (o que NÃO muda)

- `determineAudioMode`, `userWantsAudio`, `userWantsText` — intactos.
- Prompt e regra de `[MODO_AUDIO]` organico (mudança anterior) — intacta.
- `aura-tts`, Twilio, sessões, orçamento de áudio — intactos.
- `session-extractor` / `session-reminder` — intactos (já fazem o envio do resumo).

## Rollback

Ambos os fixes são surgical (1 linha + remoção de bloco morto). Reverter é trivial.
