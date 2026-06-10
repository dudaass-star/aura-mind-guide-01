## Ajuste da configuração Inworld TTS (corrigido)

O `inworld-tts-2` **não usa `temperature`** — usa `delivery_mode` com 3 valores: `STABLE`, `BALANCED`, `EXPRESSIVE`. O slider "More Creative" no painel = `EXPRESSIVE`. O `speakingRate` continua existindo igual.

### Alterações em `INWORLD_CONFIG` (`supabase/functions/aura-tts/index.ts`, linhas 22-27)

| Campo | Atual | Novo |
|---|---|---|
| `modelId` | `inworld-tts-1.5-max` | `inworld-tts-2` |
| `temperature` | `1.0` | **remover** (não existe no TTS-2) |
| novo: `delivery_mode` | — | `"EXPRESSIVE"` |
| `speakingRate` | `1.20` | `1.0` |
| `voiceId` | mantém | mantém |

### Alteração no corpo da requisição (`generateInworldTTS`, ~linha 178)

Trocar `temperature: INWORLD_CONFIG.temperature` por `delivery_mode: INWORLD_CONFIG.delivery_mode` no `JSON.stringify` enviado para `https://api.inworld.ai/tts/v1/voice`.

### Deploy
Redeploy de `aura-tts`.

### Validação pós-deploy
1. Pedir áudio à Aura no WhatsApp.
2. Conferir logs: `provider: inworld`, sem erro 400.
3. Avaliar voz: se ficar instável demais, baixar para `BALANCED`; se ficar plana, manter `EXPRESSIVE`.

### Observação importante
TTS-2 ainda está em **Research Preview** segundo a Inworld. Vale ter na cabeça que pode ter mudanças de API ou indisponibilidade pontual. O fallback de áudio→texto já existente no backend cobre isso.
