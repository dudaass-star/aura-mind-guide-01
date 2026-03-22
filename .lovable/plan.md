
# Plano: Sistema de Fases e Contexto da Aura — IMPLEMENTADO ✅

## Todas as 6 melhorias implementadas

### 1. ✅ PHASE_INSTRUCTIONS Táticas
- `SESSION_PHASE_INSTRUCTIONS` com 3 cenários (exploration_to_reframe, transition_to_closing, stuck_in_opening)
- `FREE_PHASE_INSTRUCTIONS` com 2 cenários (presenca_to_sentido, sentido_to_movimento)
- Cada um com exemplos Certo/Errado concretos
- Concatenados nas 5 guidance strings existentes

### 2. ✅ Contexto do Extrator Melhorado
- `extractActionsFromResponse` agora recebe `recentUserMessages: string[]` (últimas 3 msgs do usuário)
- Incluídas no prompt do Flash-Lite para melhor detecção de `topic_continuity`

### 3. ✅ Anti-Falso-Positivo no Extrator
- Instrução explícita: "Respostas curtas com conteúdo emocional genuíno = engaged, não short_answers"
- Só classificar como `disengaged` com mudança clara de padrão ou evasão ativa

### 4. ✅ Short Answer Streak
- `short_answer_streak` persistido no `last_user_context` (JSONB)
- Incrementado quando `engagement_level === 'short_answers'`, resetado caso contrário
- Se streak >= 2, injeta nota suave (não bloqueia avanço, mas sugere ângulos mais leves)

### 5. ✅ Transição Natural em Sessão
- Se `sessionPhase === 'exploration'` + `sessionElapsedMin > 20` + `detectedPhase === 'sentido'`
- Injeta guidance positiva: "Ótimo progresso, consolide com reframe"

### 6. ✅ Badges de Contexto no Admin
- Edge function `admin-messages` agora retorna `user_context` na ação `conversation`
- AdminMessages exibe badges coloridos: 🟢stable / 🟡vulnerable / 🔴crisis / ⚪resistant
- Também mostra `engagement_level` e `topic_continuity` quando fora do normal
