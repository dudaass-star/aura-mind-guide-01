

# Plano: Regenerar Áudio com Continuidade da Conversa

## Texto do Áudio

```text
E o que você desenha? Me conta mais sobre isso.
```

## Alterações Técnicas

### Arquivo 1: `supabase/functions/generate-demo-audio/index.ts` (NOVO - temporário)

Edge function para gerar o novo áudio:
- Reutilizar o padrão de autenticação OAuth2 do `aura-tts`
- Usar Google Cloud TTS com modelo `gemini-2.5-pro-tts`
- Voz **Erinome**, speakingRate **1.20**
- Mesmo stylePrompt acolhedor e empático
- Salvar no Storage em `meditations/demo/aura-voice.mp3` (sobrescrever arquivo existente)
- Retornar URL pública

### Arquivo 2: `supabase/config.toml`

Adicionar temporariamente a função `generate-demo-audio` com `verify_jwt = false` para permitir execução manual.

## Execução

1. Criar a edge function
2. Fazer deploy
3. Executar uma vez para gerar o áudio
4. Verificar que funcionou
5. Remover a edge function e restaurar config.toml

## Resultado

O áudio na demo será a voz da AURA perguntando "E o que você desenha? Me conta mais sobre isso." — convidando a usuária a continuar falando, exatamente como a AURA faria numa conversa real.

