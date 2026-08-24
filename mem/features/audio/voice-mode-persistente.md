---
name: Preferência de canal persistente (voice_mode)
description: profiles.voice_mode ('auto'|'audio'|'texto') + voice_mode_set_at guardam o combinado de áudio/texto por 7 dias; gravado no worker antes de qualquer handler e lido por determineAudioMode.
type: feature
---
**Problema:** `wantsAudio` era recalculado a cada turno pelo texto da mensagem. O usuário pedia áudio uma vez, a AURA prometia, e no turno seguinte "esquecia" — promessa quebrada repetidamente na mesma sessão. Pior: estados como a Cápsula do Tempo interceptavam a mensagem e o pedido nem chegava ao agente.

**Solução:**
- Colunas `profiles.voice_mode` ('auto' | 'audio' | 'texto') e `profiles.voice_mode_set_at`.
- `process-webhook-message`: `detectChannelPreference()` roda ANTES de qualquer handler de estado e persiste a preferência no perfil sempre.
- `aura-agent > determineAudioMode`: preferência vale 7 dias (`voice_mode_set_at`). `texto` fresco = respeita texto (exceto risco de vida); `audio` fresco = `reason: 'voice_mode_audio'` e entra no bypass de `splitIntoMessages`, respeitando o teto de orçamento do plano.
- Sai do modo por pedido contrário explícito ou pela expiração de 7 dias.

**Instrumentação:** falhas de TTS vazio e de envio de áudio ao provedor agora gravam em `failed_message_log` (`tts_failed`, `audio_send_failed:<provider>:<erro>`) — antes eram só `console.log` e caíam pra texto de forma invisível. `messages.is_audio` registra o canal real de entrega.

**Cápsula do Tempo:** expiração determinística de 1h via `capsule_state_set_at`, teto de 2 prompts (`capsule_prompt_count`) e saída imediata se o usuário pedir troca de canal. O timeout antigo de 24h era código morto (ficava abaixo dos `return`).
