

## Diagnóstico

O erro é **`ReferenceError: dateTimeContext is not defined`** na linha 3128 do deploy (corresponde a ~3239 no source). 

A variável `dateTimeContext` é usada nas linhas 3239-3591 mas **nunca é declarada**. A chamada `const dateTimeContext = getCurrentDateTimeContext()` foi perdida durante a refatoração do `Promise.allSettled`.

## Correção

**Arquivo**: `supabase/functions/aura-agent/index.ts`

Adicionar uma única linha antes do bloco `dynamicContext` (antes da linha 3236):

```typescript
const dateTimeContext = getCurrentDateTimeContext();
```

Pode ser inserida na linha 3235 ou logo após o fechamento do bloco `firstSessionContext` (linha 3233). A função `getCurrentDateTimeContext()` já existe (linha 30) e retorna `{ currentDate, currentTime, currentWeekday }`.

Isso corrige todos os 4 fails do teste causados pelo HTTP 500.

