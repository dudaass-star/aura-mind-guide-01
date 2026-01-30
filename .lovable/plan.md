

# Plano: Gerar Áudio da AURA para a Demo

## Contexto

A Demo já está preparada para tocar áudio (tem `hasAudio: true` na última mensagem e um `AudioPlayer` que referencia `/audio/aura-demo-voice.mp3`). Falta gerar o arquivo de áudio da voz da AURA.

## Texto para o Áudio

A última sequência de mensagens da AURA que deve virar áudio:

```text
Olha só o que você acabou de me mostrar...
Você diz que não sabe o que quer,
mas seu corpo sabe.
Ele te levou pra um lugar onde o tempo sumiu.
Isso não é "só existir".
Isso é uma pista enorme.
```

## Abordagem

Como não é possível gerar um arquivo MP3 estático diretamente, vou usar o Supabase Storage:

1. Criar edge function `generate-demo-audio` que gera o áudio via TTS (voz Erinome)
2. Salvar no Storage bucket `meditations` (já existe)
3. Atualizar o `Demo.tsx` para usar a URL pública do Storage

## Alteracoes Tecnicas

### Arquivo 1: `supabase/functions/generate-demo-audio/index.ts` (NOVO)

Edge function para gerar o áudio da demo:
- Usar a mesma configuração de TTS da AURA (voz Erinome, speakingRate 1.20)
- Gerar áudio do texto completo
- Salvar no Storage em `demo/aura-voice.mp3`
- Retornar a URL pública

### Arquivo 2: `src/components/Demo.tsx`

Atualizar a referência do áudio:
- Trocar `/audio/aura-demo-voice.mp3` pela URL do Storage
- Usar a URL: `https://uhyogifgmutfmbyhzzyo.supabase.co/storage/v1/object/public/meditations/demo/aura-voice.mp3`

## Execucao

Apos criar a edge function, executar uma vez para gerar o arquivo no Storage. O áudio ficará permanentemente disponível via URL pública.

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/generate-demo-audio/index.ts` | NOVO - Edge function para gerar áudio da demo via Google Cloud TTS |
| `src/components/Demo.tsx` | Atualizar URL do áudio para usar Storage (linha 255) |

## Resultado Esperado

Quando o usuário clicar em "Ouvir" na última mensagem da demo, vai ouvir a voz da AURA (Erinome) falando a frase final com o mesmo tom acolhedor e empático que usa nas conversas reais.

