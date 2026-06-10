## Trocar TTS da Aura de Inworld para Google Cloud TTS (Erinome)

### Objetivo
Alterar a voz da Aura nas conversas normais com usuários (não meditações) do provedor Inworld para o Google Cloud TTS com a voz "Erinome".

### O que será feito
1. **Migração de banco de dados** — Atualizar a configuração `tts_model` na tabela `system_config` para o valor `google/erinome`.
   - A edge function `aura-tts` já suporta ambos os provedores (Inworld e Google Cloud TTS Erinome) via `getTTSModel()`.
   - A configuração `AURA_VOICE_CONFIG` (Erinome, speakingRate 1.20, stylePrompt terapêutico) já está presente no código.
   - Nenhuma alteração de código na edge function é necessária.

2. **Validação pós-deploy** — Confirmar que a configuração está ativa e que novos áudios usam a voz Erinome.

### Fora do escopo
- Não alterar as edge functions de meditação (`generate-meditation-audio`, `generate-chunk`).
- Não remover o secret `INWORLD_API_KEY` (mantido como fallback manual via Admin → Configurações).
- Não alterar a UI do Admin Settings (já exibe ambas as opções).

### Validação esperada
- Admin → Configurações deve exibir "Google Erinome" como modelo ativo.
- Logs da edge function `aura-tts` devem mostrar: `🔧 Active TTS model: google/erinome` e `✅ Google Cloud TTS success`.
- Novos registros em `token_usage_logs` devem ter `model = google/gemini-2.5-pro-tts`.
- Áudio gerado em conversa deve soar com a voz Erinome (acolhedora, empática, calma).