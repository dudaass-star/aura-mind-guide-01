

## Plano: Paralelizar queries de contexto no aura-agent

### O que muda

**Arquivo**: `supabase/functions/aura-agent/index.ts` (linhas ~2905-3298)

Atualmente existem **8 queries sequenciais** ao banco, todas dependendo apenas de `profile.user_id`. Vamos agrupá-las em um único `Promise.allSettled()`.

### Queries a paralelizar

| # | Tabela | Linha atual | O que busca |
|---|--------|-------------|-------------|
| 1 | messages | 2910 | Últimas 40 mensagens |
| 2 | user_insights | 2934 | Insights críticos (pessoa, identidade) |
| 3 | user_insights | 2943 | Insights gerais |
| 4 | sessions | 2961 | Últimas 3 sessões completadas |
| 5 | checkins | 3091 | Último check-in |
| 6 | session_themes | 3109 | Temas ativos |
| 7 | commitments | 3126 | Compromissos pendentes |
| 8 | sessions | 3151 | Count de sessões completadas |
| 9 | content_journeys | 3258 | Jornada atual (condicional) |
| 10 | meditations | 3274 | Catálogo ativo |

### Abordagem

1. Disparar todas as 10 queries com `Promise.allSettled()`
2. Extrair cada resultado com fallback seguro (`[]`, `null`, `0`) — se uma query falhar, as outras continuam normais
3. Processar os resultados da mesma forma que o código atual (messageHistory, userInsights, previousSessionsContext, etc.)
4. O bloco de "primeira sessão" (linhas 2982-3086) continua igual, pois depende de `isFirstSession` que vem do resultado das queries

### Resultado esperado

```text
Antes:  ~3s (10 queries sequenciais, ~300ms cada)
Depois: ~0.5s (todas em paralelo, tempo da mais lenta)
Ganho:  ~2.5s
```

