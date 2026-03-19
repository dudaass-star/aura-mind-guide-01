

## Plano: Migrar branch Google para API nativa Gemini

### Arquivo único
`supabase/functions/aura-agent/index.ts` — substituir linhas 239-277

### Mudanças

Substituir o bloco `google/*` inteiro por:

1. **Extrair e concatenar system messages** (mesmo padrão do Anthropic, linhas 171-173):
   ```typescript
   const systemMessages = messages.filter(m => m.role === 'system');
   const chatMessages = messages.filter(m => m.role !== 'system');
   const systemPrompt = systemMessages.map(m => m.content).join('\n\n');
   ```

2. **Converter messages para formato Gemini nativo**:
   - `assistant` → `role: "model"`
   - `content: string` → `parts: [{ text: string }]`
   - Merge consecutive same-role messages (mesmo padrão Anthropic)

3. **Montar body nativo**:
   ```typescript
   {
     system_instruction: { parts: [{ text: systemPrompt }] },
     contents: convertedMessages,
     generationConfig: {
       maxOutputTokens: maxTokens,
       temperature,  // omitido se reasoning
       ...(reasoningLevel && {
         thinkingConfig: {
           thinkingBudget: { low: 1024, medium: 8192, high: 24576 }[reasoningLevel] ?? 8192
         }
       })
     }
   }
   ```

4. **Endpoint e headers**:
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent
   x-goog-api-key: GEMINI_API_KEY
   ```

5. **Converter resposta para formato interno** (OpenAI-compatible):
   ```typescript
   candidates[0].content.parts[0].text → choices[0].message.content
   usageMetadata.promptTokenCount → usage.prompt_tokens
   usageMetadata.candidatesTokenCount → usage.completion_tokens
   usageMetadata.cachedContentTokenCount → usage.prompt_tokens_details.cached_tokens
   ```

### O que NÃO muda
- Branch Anthropic, Gateway, webhook-zapi, logTokenUsage — tudo intacto
- Sem fallback — se falhar, webhook envia mensagem de contingência

