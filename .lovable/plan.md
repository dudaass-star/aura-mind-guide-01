

## Análise: Cache do Gemini via Lovable AI Gateway

### Situação confirmada

1. **Prompt já está estruturado corretamente** — estático (~18k tokens) primeiro, dinâmico depois
2. **Cache registrado = 0** em todas as 224 chamadas do dia 18
3. **Não existe GEMINI_API_KEY** no projeto — todas as chamadas passam pelo Lovable AI Gateway
4. **O código de extração** (linha 131-135) tenta 3 formatos mas todos retornam 0

### Diagnóstico mais provável: Hipótese A

O Gateway normaliza a resposta para formato OpenAI-compatible e descarta `cachedContentTokenCount` e outros campos proprietários do Gemini. O código de extração está correto para OpenAI (`prompt_tokens_details.cached_tokens`) e Anthropic (`cache_read_input_tokens`), mas o Gateway simplesmente não retorna nenhum deles.

### Plano: Adicionar logs de debug + aceitar baseline

**Alteração única — `supabase/functions/aura-agent/index.ts`**

Na função `callAI`, após `return response.json()` (linha 269), interceptar para logar o response completo:

```typescript
const result = await response.json();
console.log('GATEWAY_USAGE_RAW:', JSON.stringify(result.usage));
console.log('GATEWAY_KEYS:', Object.keys(result).join(','));
if (result.usage) {
  console.log('GATEWAY_USAGE_KEYS:', Object.keys(result.usage).join(','));
  if (result.usage.prompt_tokens_details) {
    console.log('GATEWAY_PTD:', JSON.stringify(result.usage.prompt_tokens_details));
  }
}
return result;
```

Isso vai revelar em uma única interação de teste:
- Se o Gateway retorna campos de cache num formato não capturado → corrigimos a extração
- Se não retorna nada de cache → o custo de ~$2/dia é o baseline real, e a métrica "Economia com Cache" deve ser removida ou marcada como "não disponível via Gateway"

### Impacto

- 1 arquivo editado, 1 deploy
- Resultado visível nos logs após a próxima conversa de qualquer usuário
- Zero risco para funcionalidade existente

