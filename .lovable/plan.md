# Safety Net D0 — Plano Técnico (v3)

## Objetivo
Capturar o caso em que a Aura confirma a 1ª sessão D0 verbalmente mas esquece de emitir `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]`. O extractor **nunca cria sessão** — apenas envia uma re-confirmação proativa para que o usuário responda "sim", e aí o fluxo existente (`aura-agent` regex → INSERT em `sessions`) faz o trabalho normal.

## Escopo
- Apenas o **convite D0 da 1ª sessão** (`profiles.pending_first_session_invite=true` no início do turno).
- Reagendamento, setup mensal e sessões avulsas continuam tag-only.

---

## Arquitetura

```text
aura-agent (responde) ──► hasScheduleTag? 
                              │
                       não ───┴─── sim → fluxo normal (regex cria sessão)
                              │
                  shouldRunScheduleSafetyNet()
                  (gates zero-custo)
                              │
                              ▼
              await UPDATE profiles SET extractor_pending=true
                              │
                       ok ────┴──── falhou → ABORTA (não invoca extractor)
                              │
                              ▼
              EdgeRuntime.waitUntil(invoke schedule-tag-extractor)
                              │
                              ▼
              extractor → sendProactive (re-confirmação)
                              │
              usuário responde "sim" → aura-agent → tag → sessão criada
```

---

## Decisão crítica: `await` no lock (mantido)

### Por que `await` e não `Promise.all` fire-and-forget

**Custo:** UPDATE por PK em `profiles` → 50–150ms. Inserido entre a resposta da Aura (já entregue ao WhatsApp) e o `waitUntil`. Não bloqueia entrega.

**Race window se removermos o `await`:**
1. Usuário manda "bora" + "agora" em 800ms.
2. Turno 1: dispara `Promise.all([update, invoke])` — update ainda em flight.
3. Turno 2 entra no `aura-agent`, lê `extractor_pending=false` (update do turno 1 ainda não commitou), passa o gate, dispara segundo `Promise.all`.
4. Resultado: 2 extractors → 2 mensagens de re-confirmação → exatamente o cenário que o lock deveria evitar.

Com `await`, o turno 2 só lê o profile depois do commit do turno 1, vê `extractor_pending=true` e é bloqueado pelo gate.

**Erro do UPDATE = sinal de abortar.** Se o lock falha (RLS, conexão, conflito), **não invocamos o extractor**. Melhor perder uma re-confirmação do que disparar duas. Sem `await`, um erro silencioso no update vira um trigger sem proteção.

### Implementação do abort

```ts
// aura-agent/index.ts (~linha 6608, após hasScheduleTag check)
if (!hasScheduleTag && shouldRunScheduleSafetyNet(profile, message, auraResponse)) {
  const { error: lockError } = await supabase
    .from('profiles')
    .update({
      extractor_pending: true,
      extractor_pending_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('extractor_pending', false); // optimistic lock: só passa se ainda estava livre

  if (lockError) {
    console.error('🏷️ [SAFETY_NET] lock failed, aborting extractor invoke', lockError);
  } else {
    EdgeRuntime.waitUntil(
      supabase.functions.invoke('schedule-tag-extractor', {
        body: { userId, lastUserMessage: message, lastAuraResponse: auraResponse }
      }).catch(e => console.error('🏷️ [SAFETY_NET] invoke failed', e))
    );
  }
}
```

Notas:
- `.eq('extractor_pending', false)` adiciona **optimistic locking** — se outro turno paralelo já gravou `true`, o UPDATE retorna 0 linhas (sem erro), e o segundo invoke nem é tentado. Verificamos via `count` ou re-leitura leve; se preferir simplicidade, mantemos só o gate em memória e confiamos no commit serial do Postgres por PK.
- Latência total acrescentada ao turno: ~100ms (≈3% do delay 1.5–3.5s já existente).
- Erro não derruba a resposta — log + continue. Resposta da Aura já foi entregue antes desse bloco (linha de envio fica acima).

### TTL do lock
`extractor_pending_at` permite expirar locks órfãos. O extractor, ao terminar (sucesso ou falha), faz `UPDATE profiles SET extractor_pending=false`. Job de limpeza ou check inline: se `now() - extractor_pending_at > 10min`, considera expirado.

---

## Componentes

### 1. Migration
- `sessions.created_by text default 'aura_tag'` (valores: `aura_tag` | `extractor_reconfirm` | `manual_admin`).
- `profiles.extractor_pending boolean default false`.
- `profiles.extractor_pending_at timestamptz`.

### 2. `schedule-tag-extractor/index.ts` (novo, ~180 linhas)
- Modelo: `google/gemini-2.5-flash-lite` + tool calling.
- System prompt ultra-conservador: "qualquer ambiguidade → `confirmed=false`".
- Se `confirmed=true`: `sendProactive` com texto de re-confirmação ("Pra confirmar: nossa sessão fica marcada pra <horário>?").
- **Nunca** escreve em `sessions`.
- No `finally`: `UPDATE profiles SET extractor_pending=false`.

### 3. `aura-agent/index.ts` (+~45 linhas após 6608)
- `hasScheduleTag` (regex `/\[AGENDAR_SESSAO:/`).
- `shouldRunScheduleSafetyNet`: gates zero-custo
  - `profile.pending_first_session_invite === true`
  - `profile.extractor_pending !== true` (ou expirado >10min)
  - regex de aceite do usuário (`bora|vamos|sim|fechado|agora|...`)
  - regex de confirmação da Aura (`combinado|fechado|nos vemos|marcado|...`)
- Bloco do snippet acima.

### 4. `supabase/config.toml`
```toml
[functions.schedule-tag-extractor]
verify_jwt = false
```

### 5. `.github/workflows/deploy-functions.yml`
Adicionar deploy da nova função.

### 6. Memórias
- `mem://features/sessions/safety-net-d0.md` (novo)
- Atualizar `mem://features/sessions/scheduling-tag-contract.md` (linkar safety net)
- Atualizar `mem://features/sessions/first-session-invite-d0.md`
- Atualizar `mem://index.md`

---

## Validação pós-deploy
- Smoke test: enviar "bora" no D0 → esperar re-confirmação → responder "sim" → verificar `sessions` com `created_by='extractor_reconfirm'`.
- Query diária de auditoria: contagem por `created_by` últimas 24h.
- Alarme: se `extractor_reconfirm` > 20% do total → reabrir investigação do prompt.
- Rollback emergencial: feature flag em `profiles` ou env var no extractor para retornar imediatamente sem `sendProactive`.

## Não-objetivos
- Não cobre reagendamento, setup mensal, sessão avulsa.
- Não cria sessão silenciosamente em nenhuma hipótese.
- Não troca modelo nem faz retry de LLM.
