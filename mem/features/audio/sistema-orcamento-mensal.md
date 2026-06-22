---
name: Orçamento mensal de áudio por plano
description: Tetos mensais de áudio TTS por plano (Essencial 30 / Direção 90 / Transformação 180 min) + flag audio_mirror_enabled (piloto individual)
type: feature
---
## Tetos mensais (em `aura-agent/index.ts`)

| Plano | Min/mês | Segundos |
|---|---|---|
| Essencial | 30 | 1800 |
| Direção | 90 | 5400 |
| Transformação | 180 | 10800 |

Reset automático via `monthly-schedule-renewal` (zera `audio_seconds_used_this_month` e atualiza `audio_reset_date`).

## Modelo TTS ativo

`system_config.tts_model = "google/erinome-flash"` → `gemini-2.5-flash-tts` na API do Google Cloud (voz Erinome mantida). Sentinel `-flash` no valor seleciona Flash; sem `-flash` cai pra `gemini-2.5-pro-tts` (legado). Custo Flash = metade do Pro ($10 vs $20 por 1M tokens de saída).

## Flag `audio_mirror_enabled` (piloto)

Coluna boolean em `profiles` (default `false`). Quando `true` E o usuário envia áudio (`is_audio_message=true`) E há budget disponível E o usuário não pediu texto explicitamente E não há decisão mandatória mais forte (crise, abertura/fechamento de sessão), o `aura-agent` força `audioDecision.shouldUseAudio = true` com reason `audio_mirror_flag`. Quando estoura o teto, volta a texto normalmente. Ligada inicialmente apenas para Débora (`53b5f75d-f0b2-41fd-a0da-74e1b3ab08f1`) como piloto de 2 semanas antes de avaliar regra global.