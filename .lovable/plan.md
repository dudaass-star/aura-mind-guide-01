
# Cápsula do Tempo — Implementado ✅

## O que foi feito

1. **Tabela `time_capsules`** + colunas `awaiting_time_capsule` e `pending_capsule_audio_url` no `profiles`
2. **Intercepção no `webhook-zapi`**: antes do fluxo normal, detecta estado da cápsula e gerencia áudio/confirmação/cancelamento/regravação
3. **Tag `[CAPSULA_DO_TEMPO]` no `aura-agent`**: quando a Aura propõe e o usuário aceita, a tag ativa o modo de captura
4. **Instrução no prompt**: ~10 linhas ensinando a Aura quando/como propor a cápsula
5. **Edge function `deliver-time-capsule`**: cron diário (10h) que entrega cápsulas vencidas via WhatsApp
6. **Fluxo de confirmação**: o usuário pode regravar quantas vezes quiser antes de confirmar
