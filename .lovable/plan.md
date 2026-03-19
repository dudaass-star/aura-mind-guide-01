

## Plano: Atualizar GEMINI_API_KEY e remover fallback

### Separação de chaves (confirmado)

- **`GCP_SERVICE_ACCOUNT`** — usada pelo `aura-tts` para Google Cloud TTS (voz Erinome). Não será afetada.
- **`GEMINI_API_KEY`** — usada pelo `aura-agent` para chamadas ao Gemini. Será atualizada com a chave do AI Studio.

### Passos

1. **Atualizar o secret `GEMINI_API_KEY`** com a nova chave do Google AI Studio (formato `AIza...`)

2. **Remover o fallback para o Gateway** no `aura-agent/index.ts` — voltar ao código sem fallback (como no plano original aprovado), já que agora a chave correta estará configurada

3. **Deploy do `aura-agent`**

4. **Validação** — enviar 3 mensagens consecutivas e verificar `cached_tokens` na tabela `token_usage_logs`

