# Plano Concluído ✅

## Remover Fallback OpenAI do TTS para Manter Consistência de Voz

### Implementado

1. ✅ Removida função `generateOpenAITTS()` 
2. ✅ Adicionada função `sanitizeTextForTTS()` para limpar texto
3. ✅ Adicionada função `reformulateForRetry()` para segunda tentativa
4. ✅ Implementado retry com texto reformulado antes de falhar
5. ✅ Atualizada resposta para retornar `{ audioContent: null, fallbackToText: true, reason: "..." }`
6. ✅ Mantido status 200 mesmo em falhas para permitir parsing correto pelo chamador

### Fluxo Implementado

```text
Texto → Sanitização → Google TTS
                         ↓ (falha)
                    Reformulação → Google TTS (retry)
                                       ↓ (falha)
                                   Retorna null → Chamador envia texto
```

### Resultado

- AURA sempre fala com a voz Erinome (consistência total)
- Se Google TTS falhar, mensagem é enviada como texto
- Código mais simples sem dependência do OpenAI para TTS
