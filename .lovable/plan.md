

## Verificação: Conflito `temperature` + `reasoning_effort`

### Diagnóstico

Confirmado. Na linha 173 do `aura-agent/index.ts`, o payload do Gateway é:

```
body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
```

Se adicionarmos `reasoning_effort` ao mesmo body sem remover `temperature`, a API provavelmente retornará **400 Bad Request** — modelos com thinking ativo exigem `temperature` fixo (geralmente 1) e rejeitam o parâmetro explícito.

### Correção necessária no plano

Na linha 173, substituir o bloco do Gateway por lógica condicional:

```typescript
// Extrair modelo real e nível de reasoning
let actualModel = model;
let reasoningLevel: string | null = null;

if (model.includes(':')) {
  const parts = model.split(':');
  actualModel = parts[0];
  reasoningLevel = parts[1];
}

// Montar payload — NÃO enviar temperature com reasoning_effort
const body: any = { 
  model: actualModel, 
  messages, 
  max_tokens: maxTokens 
};

if (reasoningLevel) {
  body.reasoning_effort = reasoningLevel;
  // temperature omitida intencionalmente
} else {
  body.temperature = temperature;
}
```

### Resumo das alterações

| Arquivo | Mudança |
|---------|---------|
| `src/pages/AdminSettings.tsx` | Adicionar 4 modelos Gemini 3 Flash ao `AI_MODELS` |
| `supabase/functions/aura-agent/index.ts` | Linha ~165-174: extrair sufixo `:level`, construir payload condicionalmente sem `temperature` quando `reasoning_effort` presente |

O ponto levantado é 100% válido e crítico. Sem essa correção, qualquer seleção de modelo com nível de thinking causaria erro 400.

