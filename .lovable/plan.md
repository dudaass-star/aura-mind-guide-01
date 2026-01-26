

## Remover Fallback OpenAI do TTS para Manter Consistência de Voz

### Problema
Quando o Google Cloud TTS falha (por exemplo, por filtro de segurança), o sistema atualmente usa OpenAI com a voz "shimmer" como fallback. Isso resulta em duas vozes diferentes na experiência do usuário, o que é confuso e quebra a identidade da AURA.

### Solução
Remover o fallback para OpenAI dentro do `aura-tts` e deixar que os sistemas chamadores (`webhook-zapi` e `send-zapi-message`) usem seus próprios fallbacks para texto, que já estão implementados.

### Fluxo Atual vs. Proposto

```text
ATUAL:
Google TTS falha → OpenAI TTS (voz diferente) → Envia áudio

PROPOSTO:
Google TTS falha → Retorna null → Sistema envia texto
```

### Mudanças Necessárias

**Arquivo: `supabase/functions/aura-tts/index.ts`**

1. **Remover a função `generateOpenAITTS()`** (linhas ~155-180)
   - Não será mais necessária

2. **Remover o fallback para OpenAI** (linhas ~243-249)
   - Atualmente: se Google Cloud falha, tenta OpenAI
   - Novo: se Google Cloud falha, retorna resposta indicando falha

3. **Manter sanitização e retry com reformulação** (conforme plano anterior)
   - Primeira tentativa: texto sanitizado
   - Segunda tentativa: texto reformulado
   - Se ambas falharem: retorna `null` para o chamador

4. **Atualizar resposta de erro**
   - Retornar JSON com `{ audioContent: null, fallbackToText: true, reason: "safety_filter" }` 
   - Isso permite que os chamadores saibam que devem enviar texto

### Comportamento dos Chamadores (já implementado)

Os sistemas que chamam `aura-tts` já têm fallback para texto:

- **webhook-zapi** (linha 668-669): "Audio send failed, falling back to text"
- **send-zapi-message** (linha 90-93): "Audio generation failed, falling back to text"

Nenhuma mudança é necessária nesses arquivos - eles já tratam o caso de `audioContent` ser `null`.

### Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Google TTS sucesso | Áudio (Erinome) | Áudio (Erinome) |
| Google TTS falha | Áudio (shimmer) | Texto |

### Benefícios

- **Consistência total**: AURA sempre fala com a mesma voz (Erinome)
- **Fallback natural**: Texto é menos disruptivo que voz diferente
- **Código mais simples**: Remove dependência do OpenAI para TTS
- **Menor latência**: Não tenta segundo provedor antes de falhar

