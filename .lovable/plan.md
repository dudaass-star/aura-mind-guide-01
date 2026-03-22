

# Plano Completo: Melhorias no Sistema de Fases e Contexto da Aura

## Estado Atual
O sistema tem 3 camadas funcionais:
1. **Micro-agente extrator** (Flash-Lite) — extrai `user_emotional_state`, `topic_continuity`, `engagement_level` + ações
2. **Phase Evaluator** — detecta estagnação e injeta guidance de transição
3. **Fluxo de dados** — `process-webhook-message` lê `last_user_context` do DB (linha 375) → passa ao `aura-agent` (linha 691) → evaluator usa (linha 4529) → micro-agente salva novo estado (linha 1136)

Tudo está conectado end-to-end. Os overrides de contexto (crise, mudança de tema, resistência) funcionam.

---

## Melhorias a Implementar

### 1. PHASE_INSTRUCTIONS Táticas (Alta Prioridade)
**Problema**: O evaluator diz "vá para Fase X" mas não inclui o *como fazer*. O modelo recebe instrução genérica.

**Solução**: Criar dois mapas de instruções com exemplos Certo/Errado e concatená-los nas 5 guidance strings existentes:

- `SESSION_PHASE_INSTRUCTIONS` (sessão formal):
  - `exploration_to_reframe`: "PARE perguntas exploratórias. Sintetize com: 'Sabe o que eu percebo em tudo isso?...'" + Errado/Certo
  - `transition_to_closing`: "Converta insight em compromisso concreto: 'O que o menor passo pareceria?'"
  - `stuck_in_opening`: "Escolha O tema e aprofunde: 'De tudo que trouxe, o que mais pesa?'"

- `FREE_PHASE_INSTRUCTIONS` (conversa livre):
  - `presenca_to_sentido`: "NÃO faça mais 'me conta mais'. Traga observação + UMA pergunta-âncora" + Errado/Certo
  - `sentido_to_movimento`: "Converta sentido em menor passo. Regra de Ouro: ação sem sentido não sustenta" + Errado/Certo

**Arquivo**: `supabase/functions/aura-agent/index.ts` — adicionar constantes após `PHASE_INDICATORS` (~linha 792), concatenar nas 5 guidance strings (linhas 878, 895, 911, 937, 957)

**Custo**: Zero (determinístico). ~80-120 tokens extras só quando há stagnação.

---

### 2. Melhorar Contexto do Extrator (Média Prioridade)
**Problema**: O extrator vê apenas a última mensagem do usuário (linha 597). Para `topic_continuity`, ele precisa comparar com o tema anterior, que só infere indiretamente pela resposta da Aura.

**Solução**: Passar as últimas 2-3 mensagens do usuário ao prompt do extrator para dar base de comparação.

**Mudança**: No `extractActionsFromResponse()`, aceitar `recentUserMessages: string[]` como parâmetro e incluir no prompt:
```
CONTEXTO (mensagens anteriores do usuário):
- "msg anterior 1"
- "msg anterior 2"
MENSAGEM ATUAL: "msg atual"
```

Atualizar a chamada em `executeActionsFromExtraction` para passar o histórico.

**Custo**: ~50 tokens extras por chamada do extrator.

---

### 3. Instrução Anti-Falso-Positivo no Extrator (Média Prioridade)
**Problema**: Usuários naturalmente sucintos podem ser classificados como `disengaged` ou `short_answers`.

**Solução**: Adicionar ao prompt do extrator:
```
- IMPORTANTE: Alguns usuários são naturalmente sucintos. Só classifique como "disengaged" se houver mudança clara de padrão OU evasão ativa (ex: "tanto faz", "sei lá"). Respostas curtas com conteúdo emocional = "engaged".
```

**Arquivo**: `supabase/functions/aura-agent/index.ts`, linha ~624 (regras do extrator)

**Custo**: ~20 tokens extras no prompt.

---

### 4. Override de Resistência com `short_answers` (Baixa Prioridade)
**Problema**: Atualmente, `short_answers` no `engagement_level` não dispara nenhum override. Apenas `disengaged` cancela avanço (linha 825). Mas `short_answers` combinado com `resistant` já cobre — o gap é `short_answers` sozinho.

**Solução**: Adicionar lógica: se `engagement_level === 'short_answers'` por 2+ turnos consecutivos, tratar como resistência leve (não cancelar avanço, mas adicionar nota suave ao guidance existente).

**Implementação**: Armazenar contagem de `short_answers` consecutivos no `last_user_context` (campo extra `short_answer_streak: number`). No evaluator, se `streak >= 2`, injetar: "O usuário está respondendo de forma curta. Não force aprofundamento — tente ângulos mais leves."

**Custo**: Zero extra.

---

### 5. Guidance de Transição Natural em Sessão (Baixa Prioridade)
**Problema**: O evaluator de sessão só intervém em stagnação (3 cenários). Falta guidance para transições *naturais* — quando a exploração está indo bem e é hora de avançar organicamente.

**Solução**: Adicionar um 4º cenário na sessão: se `sessionPhase === 'exploration'` e `sessionElapsedMin > 20` e `detectedPhase === 'sentido'` (modelo já trouxe sentido naturalmente), injetar guidance positiva:
```
"Ótimo progresso. O insight está aparecendo. Agora consolide com reframe e conduza para compromisso."
```

**Custo**: Zero. ~30 tokens quando ativado.

---

### 6. Logging de Contexto no Admin (Baixa Prioridade)
**Problema**: Sem visibilidade no painel admin sobre qual `user_emotional_state` e `topic_continuity` foi detectado em cada turno.

**Solução**: O `last_user_context` já é salvo no DB (`aura_response_state`). Adicionar visualização na página `AdminMessages` — mostrar um badge ao lado de cada mensagem indicando o estado detectado naquele turno.

**Implementação**: Query `aura_response_state.last_user_context` e exibir como badges coloridos (verde=stable, amarelo=vulnerable, vermelho=crisis, cinza=resistant).

**Custo**: Zero (dados já existem).

---

## Resumo de Impacto

| Melhoria | Prioridade | Tokens Extras | Chamadas LLM Extras |
|----------|-----------|---------------|---------------------|
| PHASE_INSTRUCTIONS táticas | Alta | ~100/intervenção | 0 |
| Contexto do extrator | Média | ~50/turno | 0 |
| Anti-falso-positivo | Média | ~20/turno | 0 |
| Streak de short_answers | Baixa | 0 | 0 |
| Transição natural sessão | Baixa | ~30/intervenção | 0 |
| Logging no admin | Baixa | 0 | 0 |

**Total**: ~70 tokens extras por turno (constante) + ~130 tokens por intervenção (esporádico). Zero chamadas LLM adicionais.

