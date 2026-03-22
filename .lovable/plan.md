

# Tracking completo de chamadas externas na token_usage_logs

## Problema

Apenas o `aura-agent` registra uso de tokens. As seguintes chamadas externas NÃO são rastreadas:

1. **Inworld TTS** (`aura-tts` com provider `inworld`) — cobrado por caractere
2. **Google Cloud TTS conversacional** (`aura-tts` com provider `google-cloud`) — cobrado por caractere, usa `gemini-2.5-pro-tts`
3. **Google Cloud TTS meditações** (`generate-chunk` e `generate-meditation-audio`) — cobrado por caractere
4. **Cache creation** (`aura-agent` → `getOrCreateGeminiCache`) — custo de tokens ao criar cache novo

## Implementação

### 1. `supabase/functions/aura-tts/index.ts`

Após gerar áudio com sucesso (ou falha), inserir registro em `token_usage_logs`:
- `function_name`: `'aura-tts'`
- `call_type`: `'tts'`
- `model`: nome do provider (`'inworld/aura'` ou `'google/gemini-2.5-pro-tts'`)
- `prompt_tokens`: número de caracteres do texto (TTS cobra por caractere, não por token)
- `completion_tokens`: tamanho do áudio em bytes (para referência)
- `total_tokens`: mesma coisa que prompt_tokens (caracteres)
- `cached_tokens`: 0

Requer criar um supabase client no handler (já existe para ler `system_config`, reutilizar).

### 2. `supabase/functions/generate-chunk/index.ts`

Na função `generateAudio`, após chamada TTS bem-sucedida, inserir registro:
- `function_name`: `'generate-chunk'`
- `call_type`: `'tts-meditation'`
- `model`: `'google/gemini-2.5-pro-tts'`
- `prompt_tokens`: caracteres do chunk
- `completion_tokens`: bytes do áudio gerado

Já tem supabase client disponível via `processChunkAsync`.

### 3. `supabase/functions/generate-meditation-audio/index.ts`

Na função `generateAudioChunk`, após chamada TTS bem-sucedida, inserir registro similar ao generate-chunk. Ou, mais simples: registrar uma vez após concatenar todos os chunks com o total de caracteres do script.

### 4. `supabase/functions/aura-agent/index.ts` — cache creation logging

Na função `getOrCreateGeminiCache`, quando um cache NOVO é criado (não reutilizado), registrar:
- `function_name`: `'aura-agent'`
- `call_type`: `'cache-creation'`
- `model`: modelo do cache
- `prompt_tokens`: tamanho estimado em tokens do system prompt cacheado (len/4 como estimativa)
- `cached_tokens`: 0 (criação, não uso)

## Arquivos editados
- `supabase/functions/aura-tts/index.ts` — log após TTS
- `supabase/functions/generate-chunk/index.ts` — log após TTS de meditação
- `supabase/functions/generate-meditation-audio/index.ts` — log consolidado por meditação
- `supabase/functions/aura-agent/index.ts` — log de cache creation

## Resultado esperado
- Visibilidade total de custos no `token_usage_logs`
- Possibilidade de calcular custo real de TTS (Inworld vs Google) por dia
- Detecção de anomalias de custo em qualquer serviço externo

