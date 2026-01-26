

## Correção do Gemini TTS - Autenticação e Modelo

### Problema Identificado

Após investigar a documentação oficial do Google Gemini API, encontrei **dois problemas** no código atual:

1. **Nome do modelo incorreto**: Estamos usando `gemini-2.5-flash-tts`, mas o modelo correto é `gemini-2.5-flash-preview-tts`
2. **Método de autenticação incorreto**: A API key está sendo passada como parâmetro na URL (`?key=...`), mas deveria ser passada no **header** `x-goog-api-key`

A documentação oficial do Google mostra o exemplo correto:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -X POST \
  -H "Content-Type: application/json"
```

### Solução

Atualizar a função `generateGeminiTTS` em `supabase/functions/aura-tts/index.ts` com as seguintes correções:

1. **Corrigir o nome do modelo** para `gemini-2.5-flash-preview-tts`
2. **Mover a API key para o header** `x-goog-api-key` em vez do parâmetro URL
3. Remover o `?key=...` da URL

---

## Detalhes Técnicos

### Arquivo a modificar
`supabase/functions/aura-tts/index.ts`

### Mudanças específicas

**Antes (linhas 26-32):**
```typescript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-tts:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
```

**Depois:**
```typescript
const response = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
```

### Resultado Esperado

Após essa correção, a voz **Erinome** será gerada corretamente pelo Gemini TTS com:
- Tom acolhedor, empático e calmo
- Articulação clara e timbre suave
- Velocidade configurada em 1.20

