

# Análise Completa: Sistema de Fases e Contexto — Status e Melhorias

## O que está implementado e funcionando ✅

### 1. Micro-agente extrator com 3 campos de contexto — ✅ OK
- `user_emotional_state`, `topic_continuity`, `engagement_level` extraídos a cada turno
- `recentUserMessages` (últimas 3 do usuário) passadas ao prompt para comparação de tema
- Instrução anti-falso-positivo sobre usuários sucintos presente (linha 632)
- Custo: apenas Flash-Lite, ~15 tokens extras

### 2. Phase Evaluator com overrides de contexto — ✅ OK
- 4 prioridades na ordem correta: Crise > Topic Shift > Resistência > Short Streak
- Sessão: 3 cenários de stagnação + 1 transição natural (exploration > 20min + sentido detectado)
- Livre: 2 cenários de stagnação (presença ≥5 trocas, sentido ≥8 trocas)
- Short answer streak com nudge suave (não bloqueia)

### 3. PHASE_INSTRUCTIONS táticas — ✅ OK
- `SESSION_PHASE_INSTRUCTIONS`: 3 cenários (exploration_to_reframe, transition_to_closing, stuck_in_opening)
- `FREE_PHASE_INSTRUCTIONS`: 2 cenários (presenca_to_sentido, sentido_to_movimento)
- Cada um com exemplos Certo/Errado concretos
- Concatenados corretamente nas guidance strings

### 4. Persistência e fluxo de dados — ✅ OK
- `last_user_context` salvo no `aura_response_state` (JSONB)
- `process-webhook-message` lê e passa ao `aura-agent`
- `aura-agent` usa no evaluator antes de gerar resposta
- Streak calculado corretamente com leitura do estado anterior

### 5. Admin badges — ✅ OK
- Edge function retorna `user_context` na ação `conversation`
- UI exibe badges coloridos

---

## Problemas Encontrados 🔴

### Problema 1: Conflito de upsert no `last_user_context` (RACE CONDITION)
**Onde**: Linha 1253-1257 do aura-agent
**O que acontece**: O micro-agente faz `upsert` no `aura_response_state` com APENAS `user_id`, `last_user_context` e `updated_at`. Se o `process-webhook-message` está atualizando o mesmo registro simultaneamente (ex: `is_responding`, `pending_content`), o upsert pode sobrescrever esses campos com `null` porque não inclui os outros campos.

**Correção**: Usar `UPDATE` parcial ao invés de `upsert` completo:
```typescript
await supabase.from('aura_response_state')
  .update({ last_user_context: userContext, updated_at: new Date().toISOString() })
  .eq('user_id', userId);
```

### Problema 2: Streak de short_answers lê DB duas vezes desnecessariamente
**Onde**: Linha 1238-1244
**O que acontece**: Para calcular o streak, o micro-agente faz uma query extra ao DB para ler o `last_user_context` anterior. Mas o `last_user_context` **já foi passado** ao `aura-agent` pelo `process-webhook-message` e está disponível no escopo.

**Correção**: Passar `lastUserContext` ao `processExtractedActions` para evitar a query extra.

### Problema 3: O topic shift pode "desligar" o evaluator permanentemente
**Onde**: Linha 874-878
**O que acontece**: Quando `topic_continuity === 'shifted'`, o evaluator retorna `guidance: null` e `detectedPhase: 'initial'`. Se o micro-agente classificar como `shifted` por 2+ turnos seguidos (ex: conversa exploratória natural), o evaluator nunca chega à análise de stagnação. O campo `topic_continuity` persiste do turno anterior — se o usuário muda de tema uma vez, o next-turn evaluator vê `shifted` e ignora tudo.

**Correção**: Essa lógica está correta para 1 turno, mas o Flash-Lite deveria classificar `same_topic` no turno seguinte se o usuário continuou no novo tema. Verificar se o prompt do extrator deixa claro que `shifted` = "mudou NESTE turno vs o anterior", não "está falando de algo diferente do início da conversa". O prompt atual (linha 630) diz "compare o tema da mensagem ATUAL com as anteriores" — isso é ambíguo. 

**Melhoria no prompt**: Adicionar: "shifted = mudou de tema em relação à mensagem IMEDIATAMENTE anterior. Se continua no novo tema, classifique como same_topic."

### Problema 4: Priority 4 (short streak) faz log mas não injeta nada
**Onde**: Linhas 893-898
**O que acontece**: Quando `streak >= 2 && engagement_level === 'short_answers'`, o código faz `console.log` e tem um comentário "Don't return — let normal evaluation continue, but we'll append a note later". Porém, **nunca anexa** a nota — a lógica simplesmente cai na avaliação normal. A injeção de nudge só acontece mais abaixo (linhas 996-1001 para sessão, 1053-1061 para livre), mas **sem a condição** `engagement_level === 'short_answers'` — verifica apenas `streak >= 2`.

**Impacto**: Baixo — o nudge é injetado de qualquer forma, mas a condição inicial (linha 895) é inútil. Isso não é um bug funcional, apenas código dead path.

**Correção**: Remover o bloco das linhas 893-898 (é dead code).

---

## Melhorias Recomendadas 🟡

### Melhoria 1: Clarificar `topic_continuity` no prompt do extrator
Adicionar ao prompt: `"shifted" = o usuário mudou de tema EM RELAÇÃO à mensagem imediatamente anterior. Se ele continua explorando o novo tema (mesmo diferente do início da conversa), classifique como "same_topic".`

### Melhoria 2: Evitar upsert destrutivo → usar UPDATE parcial
Trocar o `upsert` por `update` no salvamento de `last_user_context` para evitar sobrescrita de campos.

### Melhoria 3: Passar `lastUserContext` ao processExtractedActions
Evitar query extra ao DB para calcular streak. O contexto anterior já está disponível.

### Melhoria 4: Limpar dead code no Priority 4
Remover bloco 893-898 que faz log mas nunca age.

---

## Resumo

| Componente | Status | Nota |
|------------|--------|------|
| Extrator Flash-Lite + 3 campos | ✅ OK | Prompt claro, anti-falso-positivo |
| Phase Evaluator overrides | ✅ OK | 4 prioridades corretas |
| PHASE_INSTRUCTIONS táticas | ✅ OK | Exemplos Certo/Errado concretos |
| Persistência DB | ⚠️ Race condition | Upsert pode sobrescrever campos |
| Streak calculation | ⚠️ Query extra desnecessária | Pode usar contexto já disponível |
| Topic shift prompt | ⚠️ Ambíguo | Pode causar evaluator bypass prolongado |
| Admin badges | ✅ OK | Funcionando |

### Implementação proposta
4 correções pontuais no `supabase/functions/aura-agent/index.ts`:
1. Upsert → UPDATE parcial (~2 linhas)
2. Passar lastUserContext ao processExtractedActions (~5 linhas)
3. Clarificar prompt de `topic_continuity` (~1 frase)
4. Remover dead code Priority 4 (~5 linhas)

Custo: zero. Tokens: zero extras. Apenas correções de robustez.

