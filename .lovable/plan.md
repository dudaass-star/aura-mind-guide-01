
# Plano: Atualizar Texto do Áudio da Demo

## Objetivo

Regenerar o áudio da demo com o novo texto:
> "O que você costuma desenhar? O que você gosta de desenhar mais?"

## Alterações Técnicas

### 1. Criar Edge Function Temporária

**Arquivo:** `supabase/functions/generate-demo-audio/index.ts`

Recriar a função com os mesmos parâmetros de voz aprovados anteriormente:
- **Voz:** Erinome
- **Modelo:** gemini-2.5-pro-tts
- **speakingRate:** 1.05 (ritmo mais lento e natural)
- **stylePrompt:** "Fale de forma calorosa e genuinamente curiosa, como uma amiga próxima fazendo uma pergunta com interesse real. Tom suave, ritmo tranquilo, pausas naturais. Sem pressa. Voz acolhedora e presente."
- **Texto:** "O que você costuma desenhar? O que você gosta de desenhar mais?"

### 2. Atualizar config.toml

Adicionar configuração temporária:
```toml
[functions.generate-demo-audio]
verify_jwt = false
```

### 3. Executar e Fazer Upload

- Deploy da função
- Executar para gerar o áudio
- Upload automático para `meditations/demo/aura-voice.mp3` (sobrescreve o arquivo atual)

### 4. Cleanup

- Deletar a função `generate-demo-audio`
- Remover entrada do `config.toml`

## Resultado

O áudio na demo da landing page será atualizado com a nova pergunta, mantendo o mesmo tom natural e acolhedor já aprovado.
