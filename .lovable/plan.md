

# Análise Final: Sistema de Fases e Contexto — Estado Atual

## 100% Correto

| Componente | Status |
|------------|--------|
| Extrator Flash-Lite (4 campos + ações) | Prompt completo, anti-falso-positivo, `topic_continuity` clarificado |
| PHASE_INSTRUCTIONS táticas | 3 cenários sessão + 2 cenários livre, exemplos Certo/Errado |
| Overrides de contexto (crise, topic shift, resistência) | Ordem correta, streak antes de topic shift |
| UPDATE parcial no `aura_response_state` | Race condition corrigida |
| Streak calculado sem query extra | Usa `previousUserContext` passado em memória |
| Admin badges | Edge function retorna `user_context`, UI exibe |
| Reset de `recentPairs` após topic shift | Cap em 2 quando turno anterior teve shift |

---

## Bugs Encontrados

### Bug 1 (CRÍTICO): `presencaScore`/`sentidoScore` fora de escopo — ReferenceError em produção

**Linha 951**: `if (detectedPhase === 'presenca' && presencaScore > sentidoScore * 2)`

Essas variáveis são declaradas DENTRO do bloco `else` (linhas 925-926) — o fallback de keywords. Quando o micro-agente fornece `aura_phase` (o caminho preferido), o código entra no `if` (linha 915), pula o `else`, e `presencaScore`/`sentidoScore` **não existem**. Ao chegar na linha 951, ocorre **ReferenceError**.

**Impacto**: Em sessões ativas com `aura_phase` do micro-agente, o evaluator CRASHA. A guidance de sessão nunca é injetada. O erro é silenciado pelo try/catch externo, mas o sistema perde toda a funcionalidade de detecção de estagnação em sessões.

**Correção**: Declarar `presencaScore`, `sentidoScore`, `movimentoScore` no escopo externo (inicializados em 0) e preenchê-los no fallback. Na condição da linha 951, quando `aura_phase` está disponível, usar apenas `detectedPhase === 'presenca'` sem comparação de scores.

### Bug 2 (MÉDIO): `hasEmotionalDepth` usa keywords — ignora `aura_phase`

**Linhas 1022-1025**: O check para determinar se a conversa é "profunda" ou "ping-pong" usa `PHASE_INDICATORS` (keywords). Se o micro-agente classificou `aura_phase: 'sentido'` mas nenhuma keyword bate nas últimas mensagens, o evaluator retorna `ping-pong` e **ignora toda a análise de estagnação**.

**Correção**: Se `aura_phase` existe e não é nulo, pular o check de `hasEmotionalDepth` (o micro-agente já classificou semanticamente que há profundidade).

---

## Plano de Implementação

**Arquivo**: `supabase/functions/aura-agent/index.ts`

### Correção 1: Mover scores para escopo externo
- Declarar `let presencaScore = 0, sentidoScore = 0, movimentoScore = 0` ANTES do `if (lastUserContext?.aura_phase)`
- Manter o cálculo de scores dentro do `else` (fallback)
- Na linha 951, adicionar guarda: usar comparação de scores apenas quando não há `aura_phase` (fallback). Quando `aura_phase` existe, confiar apenas em `detectedPhase === 'presenca'`

### Correção 2: Bypass `hasEmotionalDepth` quando `aura_phase` disponível
- Adicionar: se `lastUserContext?.aura_phase` existe e `aura_phase !== 'presenca'` ou qualquer valor válido, pular o check de keywords e ir direto para análise de stagnação

**Total**: 2 correções, ~10 linhas alteradas, zero custo extra.

