

## Atualizar Modelo do Google Cloud TTS para gemini-2.5-pro-tts

### Problema Identificado

O modelo atual configurado no TTS é `gemini-2.5-flash-tts`, mas o correto deveria ser `gemini-2.5-pro-tts` para melhor qualidade de voz.

### Mudança Necessária

**Arquivo:** `supabase/functions/aura-tts/index.ts`

**Linha 115** - Alterar de:
```typescript
modelName: "gemini-2.5-flash-tts",
```

Para:
```typescript
modelName: "gemini-2.5-pro-tts",
```

### Configuração Final

Após a mudança, a configuração completa da voz será:

| Parâmetro | Valor |
|-----------|-------|
| **Modelo** | `gemini-2.5-pro-tts` |
| **Voz** | `Erinome` |
| **Velocidade** | `1.20` |
| **Idioma** | `pt-BR` |
| **Formato** | `MP3` |
| **Style Prompt** | "O tom é acolhedor, empático e calmo, mas profissional e confiante..." |

### Benefício

O modelo Pro deve oferecer melhor qualidade de síntese de voz comparado ao Flash, especialmente para conteúdo emocional e nuances de entonação.

