# Trial "Primeira Jornada" — Detecção de Marcos de Valor ✅ Implementado

## Resumo
Trial expandido de 10 para **50 mensagens ou 72h**, com detecção inteligente de "Aha Moment" em duas camadas para acionar nudges de conversão no momento certo.

### Limites
- Hard cap: 50 mensagens OU 72 horas (o que vier primeiro)
- Fallback de nudges: msg 45 e 48 se Aha não detectado

### Fases do Trial (`trial_phase`)
- `listening` — Escuta ativa (msgs 1-7, sem intervenção)
- `value_delivered` — Aura entregou valor real (tag `[VALOR_ENTREGUE]`)
- `aha_reached` — Usuário reagiu positivamente ao valor (detectado por heurísticas)
- `converting` — Nudges de conversão ativos

### Detecção em Duas Camadas

**Camada 1 — Tag da Aura: `[VALOR_ENTREGUE]`**
- Aura marca quando entrega: reframe, técnica prática, insight estruturado
- NÃO marca: validação simples, perguntas abertas, acolhimento genérico
- Webhook detecta a tag → `trial_phase = 'value_delivered'`

**Camada 2 — Resposta do Usuário**
- Só avaliada quando `trial_phase = 'value_delivered'` E `count >= 8`
- Detecta palavras-chave positivas sem "?" (lista de ~25 termos)
- Ao detectar → `trial_phase = 'aha_reached'`, salva `trial_aha_at_count`

### Sequência de Nudges
- Aha + 2 msgs: nudge suave ("Tô adorando te conhecer...")
- Aha + 4 msgs: nudge com link de checkout
- Fallback msg 45: nudge se Aha não detectado
- Fallback msg 48: nudge final
- Msg 50 / 72h: bloqueio + follow-up sequence (5 touchpoints)

### O que foi implementado
1. **Migração SQL** ✅ — `trial_phase text` e `trial_aha_at_count integer` em `profiles`
2. **`aura-agent/index.ts`** ✅ — Tag `[VALOR_ENTREGUE]` + contexto dinâmico por fase/aha
3. **`webhook-zapi/index.ts`** ✅ — Limite 50/72h, detecção de tag, análise de Aha, strip de tag
4. **`start-trial/index.ts`** ✅ — Mensagem de boas-vindas sem número fixo
5. **Frontend** ✅ — `StartTrial.tsx`, `TrialStarted.tsx`, `AdminMessages.tsx`, `AdminEngagement.tsx`
6. **`execute-scheduled-tasks/index.ts`** ✅ — Textos atualizados
7. **`admin-engagement-metrics/index.ts`** ✅ — Funnel atualizado (20+ msgs = engajado)
