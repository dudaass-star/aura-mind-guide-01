

# Implementação: Seletor de Modelo de Áudio + Inworld TTS

## Pré-requisito: Secret `INWORLD_API_KEY`

Antes de implementar, preciso solicitar que você insira a API Key do Inworld (o valor Base64 do header `Authorization: Basic ...`). Farei isso via ferramenta de secrets no momento da implementação.

## Mudanças

### 1. `src/pages/AdminSettings.tsx`
- Adicionar estado para `selectedTTSModel` / `currentTTSModel` (default: `google/erinome`)
- Carregar config `tts_model` do `system_config` (junto com `ai_model`)
- Novo Card com icone `Mic` abaixo do Card de IA:
  - Modelos disponíveis:
    - `google/erinome` — "Google Erinome (Atual)" — Voz Erinome via Google Cloud TTS
    - `inworld/aura` — "Inworld Aura" — Voz customizada criada no Inworld
  - Botão Salvar independente, salva key `tts_model` no `system_config`

### 2. `supabase/functions/aura-tts/index.ts`
- No início do handler, ler `tts_model` do `system_config` via Supabase client (service role)
- Nova função `generateInworldTTS(text)`:
  - `POST https://api.inworld.ai/tts/v1/voice`
  - `Authorization: Basic ${INWORLD_API_KEY}`
  - Body: `{ text, voiceId: "default-m-ple0rtxdeidhocwm57qw__aura", modelId: "inworld-tts-1.5-max", speakingRate: 1.05, temperature: 1 }`
  - Retorna `audioContent` base64 (mesmo formato do Google)
- Roteamento: se modelo = `inworld/aura` → `generateInworldTTS()`, senão → fluxo Google atual
- Fallback: qualquer provedor que falhar retorna `fallbackToText: true` (sem troca automática)

### 3. Secret `INWORLD_API_KEY`
- Solicitar via `add_secret` durante implementação

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/AdminSettings.tsx` | Novo Card "Modelo de Áudio" |
| `supabase/functions/aura-tts/index.ts` | Ler config + `generateInworldTTS()` + roteamento |

