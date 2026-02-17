

## Correção definitiva: Respostas da Aura ainda cortadas

### Problema
Mesmo após o aumento de `max_tokens` de 700 para 1500, a última resposta da Aura ao Eduardo (22:12) ainda está truncada:

> "Nossa, Eduardo... que bomba. Imagino o peso que isso tá sendo pra você carregar sozinho. ||| É um dilema gigante, porque não existe uma resposta "certa" ou fácil, né? De um lado, o instinto de proteger sua irmã da dor e"

Termina em "da dor e" -- claramente cortada no meio da frase.

### Causa raiz
1. **1500 tokens ainda é insuficiente** para tópicos complexos onde a Aura precisa escrever múltiplos balões com profundidade emocional
2. **O monitoramento não está funcionando** -- o check de `finish_reason === 'length'` pode não capturar o valor correto retornado pelo gateway Gemini (que pode ser `'MAX_TOKENS'`, `'max_tokens'`, ou outro)

### Solução (2 mudanças no mesmo arquivo)

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudança 1 - Aumentar max_tokens para 4096 (linha 3416)**

```typescript
// De:
max_tokens: 1500,
// Para:
max_tokens: 4096,
```

Justificativa:
- A Aura raramente gera mais de 800 tokens em respostas normais
- Em sessões ou temas complexos, pode chegar a 2000-3000 tokens (múltiplos balões + tags internas como COMPROMISSO, TEMA_NOVO, etc.)
- 4096 dá margem confortável sem risco de custos extras (o modelo só gera o que precisa)
- O Gemini 2.5 Pro suporta até 65k tokens de saída

**Mudança 2 - Corrigir detecção de truncamento (linhas 3449-3452)**

```typescript
// De:
const finishReason = data.choices?.[0]?.finish_reason;
if (finishReason === 'length') {
  console.warn('⚠️ Response truncated (max_tokens reached). Consider increasing max_tokens.');
}

// Para:
const finishReason = data.choices?.[0]?.finish_reason;
console.log(`📊 API finish_reason: ${finishReason}, response length: ${data.choices?.[0]?.message?.content?.length || 0} chars`);
if (finishReason && finishReason !== 'stop') {
  console.warn(`⚠️ Response may be truncated (finish_reason: ${finishReason}). Consider increasing max_tokens.`);
}
```

Isso captura qualquer valor que não seja `'stop'` (como `'length'`, `'MAX_TOKENS'`, etc.) e sempre loga o `finish_reason` para monitoramento.

### Impacto
- Elimina truncamento mesmo em respostas longas com tags internas
- Monitoramento robusto que funciona independente do formato do gateway
- Custo zero adicional (modelo gera apenas o necessário; o limite é um teto de segurança)

