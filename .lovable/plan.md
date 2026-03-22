

# Análise Completa: Sistema de Fases e Contexto — Estado Atual

## Resultado: Sistema 95% Sólido

As 4 correções da última iteração foram aplicadas corretamente. O sistema está funcional e robusto. Restam apenas ajustes menores de refinamento.

---

## O que está 100% correto

| Componente | Verificação |
|------------|-------------|
| Extrator Flash-Lite (3 campos + ações) | Prompt com `recentUserMessages`, anti-falso-positivo, `topic_continuity` clarificado |
| Phase Evaluator (4 prioridades) | Crise > Topic Shift > Resistência > Análise normal — ordem correta |
| PHASE_INSTRUCTIONS táticas | 3 cenários sessão + 2 cenários livre, todos com exemplos Certo/Errado |
| Transição natural em sessão | Exploração > 20min + sentido detectado → guidance proativo |
| Short answer streak | Calculado via `previousUserContext` (sem query extra), nudge suave injetado |
| Upsert → UPDATE parcial | Race condition corrigida — `.update()` com `.eq('user_id')` |
| Prompt `topic_continuity` | Clarificado: "shifted = relativo à mensagem IMEDIATAMENTE anterior" |
| Dead code Priority 4 | Removido corretamente |
| Fluxo de dados end-to-end | `process-webhook-message` lê → passa ao `aura-agent` → evaluator usa → micro-agente salva |
| Admin badges | Edge function retorna `user_context`, UI exibe badges |

---

## Melhorias Restantes (Refinamento)

### 1. O evaluator retorna cedo demais no topic shift (risco baixo)
**Linha 874-878**: Quando `topic_continuity === 'shifted'`, retorna `guidance: null` e `detectedPhase: 'initial'`. Isso impede qualquer outra análise nesse turno — inclusive o nudge de `short_answer_streak`. Se o usuário mudou de tema E está dando respostas curtas, o streak nudge é silenciado.

**Correção**: Mover o check de `short_answer_streak` para ANTES do topic shift return, ou fazer o topic shift não retornar imediatamente — apenas resetar `stagnationLevel` e deixar o resto da avaliação continuar.

### 2. `recentPairs` conta mensagens do histórico inteiro, não do tema atual
**Linha 926**: `recentPairs = messageHistory.filter(m => m.role === 'user').slice(-10).length` — conta as últimas 10 mensagens do usuário independente de mudança de tema. Após um topic shift, a contagem de "5+ trocas em Presença" deveria resetar, mas não reseta porque usa o histórico bruto.

**Impacto**: Após o usuário mudar de tema, o evaluator pode detectar "estagnação em Presença" prematuramente (porque conta trocas do tema anterior).

**Correção**: Usar o `short_answer_streak` como proxy de continuidade — se o streak foi resetado por um topic shift, o evaluator já não injeta guidance nesse turno. O problema só aparece no turno N+2 (quando `topic_continuity` volta a `same_topic` mas `recentPairs` ainda inclui mensagens do tema anterior). Solução ideal: resetar `recentPairs` quando o último `topic_continuity` salvo era `shifted` — ou seja, se o turno anterior teve shift, começar a contar do zero.

### 3. `countIndicators` usa keywords — mesmo sistema que foi criticado antes
**Linhas 905-913**: O `detectedPhase` é calculado via `PHASE_INDICATORS` (listas de palavras-chave como "como você se sente", "menor passo"). Esse é o MESMO tipo de detecção frágil que motivou a criação do micro-agente. O micro-agente extrai o estado do USUÁRIO corretamente, mas a detecção de fase da AURA (o que a assistente está fazendo) ainda usa keywords.

**Impacto**: Médio. O evaluator pode detectar incorretamente que a Aura está em "presença" quando ela usou uma palavra-chave de sentido em outro contexto.

**Correção futura**: Adicionar um campo `aura_detected_phase` ao micro-agente extrator para que o Flash-Lite classifique a fase da resposta da Aura semanticamente. Custo: ~5 tokens extras.

---

## Plano de Implementação

Arquivo: `supabase/functions/aura-agent/index.ts`

### Correção 1: Topic shift não silenciar short_answer_streak
Reorganizar a lógica no evaluator para que o check de `short_answer_streak >= 2` seja avaliado ANTES do early-return do topic shift.

### Correção 2: Resetar contagem de trocas após topic shift
Adicionar lógica: se `lastUserContext?.topic_continuity === 'shifted'`, reduzir o `recentPairs` efetivo (ou ignorar a análise de stagnação por 1 turno).

### Correção 3: Adicionar `aura_detected_phase` ao extrator
Adicionar campo ao schema do Flash-Lite: `"aura_phase": "presenca|sentido|movimento"` — substituir o `countIndicators` por essa classificação semântica. Custo: ~5 tokens extras.

**Total**: 3 mudanças pontuais, zero chamadas LLM extras (a correção 3 reutiliza a chamada existente do extrator).

