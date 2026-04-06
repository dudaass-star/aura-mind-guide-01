

## Verificação: Custo de IA no Dashboard

### Resultado

O valor de **$8.51** exibido no dashboard está **essencialmente correto**. Verifiquei os dados brutos da tabela `token_usage_logs` e recalculei manualmente:

| Modelo | Chamadas | Custo Calculado |
|---|---|---|
| google/gemini-2.5-pro (conversas) | 799 | $6.69 |
| gemini-2.5-pro (cache-creation) | 122 | $1.49 |
| gemini-2.5-flash-lite | 1,592 | $0.33 |
| **Total** | **2,513** | **~$8.51** |

A economia com cache de **$8.34** também está correta — sem cache, só o input do Pro custaria ~$14.37.

### Problema menor encontrado

O modelo `gemini-2.5-flash-lite` não tem entrada na tabela de preços do edge function. Ele cai no fallback ($0.15/$0.60), quando o preço real é **$0.075/$0.30** (metade). Isso causa uma sobrestimativa de ~$0.17 no Flash Lite — insignificante no total, mas tecnicamente incorreto.

### Correção proposta

Adicionar `gemini-2.5-flash-lite` à tabela `MODEL_PRICING` no edge function `admin-engagement-metrics/index.ts`:

```typescript
'gemini-2.5-flash-lite': { input: 0.075, inputCached: 0.01875, output: 0.30 },
```

**1 arquivo editado**: `supabase/functions/admin-engagement-metrics/index.ts` (1 linha adicionada na tabela de preços)

