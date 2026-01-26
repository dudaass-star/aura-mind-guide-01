
# Plano: Migrar TTS da AURA para Gemini 2.5 Pro TTS

## Visão Geral

Vamos migrar o sistema de Text-to-Speech da AURA de OpenAI para Google Gemini 2.5 Pro TTS, usando a voz **Erinome** com instruções de estilo personalizadas para criar uma experiência mais acolhedora e terapêutica.

## Configurações da Nova Voz

| Parâmetro | Valor |
|-----------|-------|
| Modelo | `gemini-2.5-pro-tts` |
| Voz | `Erinome` (feminina) |
| Idioma | `pt-BR` |
| Velocidade | `1.20` |
| Instrução de Estilo | "O tom é acolhedor, empático e calmo, mas profissional e confiante. Nada robótico. Articulação clara, timbre suave, fala lenta e gentilmente, como uma terapeuta ou uma amiga próxima oferecendo apoio" |

## Pré-requisito

Você precisará configurar uma credencial do Google Cloud:

1. Acesse o Google Cloud Console
2. Habilite a API Text-to-Speech
3. Crie uma API Key
4. Adicione como secret `GOOGLE_CLOUD_API_KEY`

## Mudanças Técnicas

### 1. Atualizar `supabase/functions/aura-tts/index.ts`

Substituir a chamada à API OpenAI pela API do Google Cloud TTS:

**Antes (OpenAI):**
```
Endpoint: https://api.openai.com/v1/audio/speech
Model: tts-1
Voice: shimmer
Speed: 1.0
```

**Depois (Google Gemini):**
```
Endpoint: https://texttospeech.googleapis.com/v1/text:synthesize
Model: gemini-2.5-pro-tts
Voice: Erinome
Speed: 1.20
Style Prompt: (instrução personalizada)
```

**Estrutura da requisição Google:**
```text
POST https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}

{
  "input": {
    "text": "Mensagem da AURA",
    "prompt": "O tom é acolhedor, empático e calmo..."
  },
  "voice": {
    "languageCode": "pt-BR",
    "name": "Erinome",
    "modelName": "gemini-2.5-pro-tts"
  },
  "audioConfig": {
    "audioEncoding": "MP3",
    "speakingRate": 1.20
  }
}
```

### 2. Manter Fallback para OpenAI

Se o Google falhar, usar OpenAI como backup:
- Primeiro tenta Google Gemini TTS
- Se falhar, usa OpenAI tts-1 (shimmer)

### 3. Ajustar Limite de Caracteres

- **Limite atual:** 500 caracteres
- **Limite Google:** 4.000 bytes (~4.000 caracteres)
- Podemos aumentar o limite para 2.000 caracteres se necessário

## Comparação de Custos

| Provedor | Custo/1M chars | Estimativa Mensal* |
|----------|----------------|-------------------|
| OpenAI tts-1 (atual) | $15.00 | ~$7.50 |
| Gemini 2.5 Pro TTS | ~$21.00 | ~$10.50 |

*Baseado em ~500K caracteres/mês

**Nota:** O custo é ~40% maior, mas a qualidade e personalização são superiores.

## Etapas de Implementação

1. **Configurar secret** - Adicionar `GOOGLE_CLOUD_API_KEY`

2. **Atualizar `aura-tts`**
   - Trocar endpoint para Google Cloud TTS
   - Configurar voz Erinome com style prompt
   - Velocidade 1.20
   - Adicionar fallback para OpenAI

3. **Testar**
   - Gerar áudio de teste
   - Validar qualidade da voz
   - Confirmar envio via WhatsApp

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/aura-tts/index.ts` | Migrar de OpenAI para Google Gemini TTS |

**Nenhuma alteração necessária em:**
- `send-zapi-message/index.ts` (interface permanece igual)
- `webhook-zapi/index.ts` (interface permanece igual)
- `_shared/zapi-client.ts` (interface permanece igual)
