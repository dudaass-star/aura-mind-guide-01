

# Plano: Detecção de Contexto do Usuário via Micro-Agente (sem keywords)

## Problema com a abordagem anterior
Usar listas de palavras-chave (`"não aguento"`, `"mudando de assunto"`) é frágil — falsos positivos, falsos negativos, e não captura nuance. O usuário pode regredir emocionalmente sem usar nenhuma dessas palavras.

## Solução: Reaproveitar o micro-agente extrator (custo zero extra)

O micro-agente pós-resposta (`extractActionsFromResponse`) **já roda a cada turno** usando Flash-Lite. Basta adicionar 3 campos ao schema de extração:

```text
Fluxo:
  Turno N: Aura responde → micro-agente extrai ações + estado do usuário → salva no DB
  Turno N+1: Phase evaluator lê o estado salvo → ajusta guidance
```

### Campos adicionados ao extractor (sem chamada LLM extra)

| Campo | Tipo | Valores |
|-------|------|---------|
| `user_emotional_state` | enum | `stable`, `vulnerable`, `crisis`, `resistant` |
| `topic_continuity` | enum | `same_topic`, `shifted`, `new_topic` |
| `engagement_level` | enum | `engaged`, `short_answers`, `disengaged` |

### Como o Phase Evaluator usa esses dados

1. **`vulnerable` ou `crisis`** → Reset para Presença, anular qualquer avanço de fase
2. **`shifted` ou `new_topic`** → Resetar contagem de stagnation, deixar Aura responder naturalmente
3. **`resistant` ou `disengaged`** → Anular guidance de avanço, injetar instrução de dar espaço

### Mudanças no código

**Arquivo: `supabase/functions/aura-agent/index.ts`**

1. **Adicionar 3 campos ao schema do extractor** dentro de `extractActionsFromResponse()` — ~10 linhas
2. **Salvar o resultado** no campo existente de metadados da conversa (ou em memória para o próximo turno)
3. **No `evaluateTherapeuticPhase()`**: Ler o estado do turno anterior e aplicar os 3 early-returns (vulnerabilidade, mudança de tema, resistência) — ~15 linhas
4. **Remover** as constantes `TOPIC_SHIFT_INDICATORS`, `EMOTIONAL_REGRESSION_INDICATORS`, `RESISTANCE_INDICATORS` se já existirem

### Vantagens sobre keywords
- Flash-Lite **entende contexto** — "tô cansada de tudo" pode ser exaustão ou desistência, o modelo distingue
- Sem falsos positivos por palavras comuns ("não sei" pode ser reflexão genuína, não resistência)
- Custo: **zero extra** — já paga pela chamada do extrator

### Custo
Adicionar 3 campos enum ao output do extractor soma ~15 tokens extras por chamada. Custo: ~$0.000002 por turno.

