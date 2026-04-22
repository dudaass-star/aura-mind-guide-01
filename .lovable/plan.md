

# Corrigir entrega de áudios da Aura (TTS via URL pública + limpeza automática)

## Problema
Os áudios gerados pelo `aura-tts` (Inworld/Google) **não estão chegando aos usuários** há 14 dias. O pipeline retorna base64, mas a API oficial Twilio/Meta só aceita URL pública. Resultado: todos os áudios silenciosamente caem para fallback de texto.

## Solução
Mudar `aura-tts` para fazer upload do MP3 no Supabase Storage e retornar URL pública. Atualizar o consumidor para usar `sendAudioUrl()`. Adicionar limpeza automática diária (TTL 7 dias).

---

## Implementação

### 1. Criar bucket público `aura-tts-audios` (migration)
- Bucket público (Twilio precisa baixar sem auth)
- Sem políticas de INSERT/UPDATE/DELETE para usuários (apenas service role via edge functions)
- Política de SELECT público para leitura

### 2. Atualizar `supabase/functions/aura-tts/index.ts`
- Após gerar `audioBytes`, fazer upload para `aura-tts-audios/{userId}/{timestamp}-{random}.mp3`
- Obter URL pública via `supabase.storage.from(...).getPublicUrl(path)`
- Retornar no payload: `{ audioUrl, storagePath, format, voice, provider, fallbackToText: false }`
- **Manter** `audioContent` (base64) por compatibilidade temporária — assim nada quebra se outro consumidor ainda usar base64
- Aceitar `userId` opcional no body para organizar arquivos por usuário (fallback: `shared/`)

### 3. Atualizar `supabase/functions/process-webhook-message/index.ts`
- Localizar a chamada atual `sendAudio(phone, audioBase64)`
- Substituir por `sendAudioUrl(phone, audioUrl)` usando o `audioUrl` retornado pelo `aura-tts`
- Passar `userId` na chamada do `aura-tts` para organização
- Manter fallback para texto se `audioUrl` ausente

### 4. Limpeza automática (TTL 7 dias)
- Nova edge function `cleanup-tts-audios/index.ts`:
  - Lista objetos em `aura-tts-audios` com `created_at < now() - 7 days`
  - Deleta em lote (até 1000 por execução)
  - Loga total removido em `console.log`
- Cron job diário às 04h BRT (07h UTC) via `pg_cron` + `pg_net`
- `verify_jwt = false` em `supabase/config.toml` para a função

### 5. Logs de observabilidade
- `aura-tts`: logar `audioUrl`, `storagePath`, `uploadDurationMs`
- `process-webhook-message`: logar quando usa URL vs quando cai no fallback de texto

---

## Arquivos afetados

```text
supabase/migrations/<timestamp>_create_aura_tts_bucket.sql    [NOVO]
supabase/functions/aura-tts/index.ts                          [MODIFICAR]
supabase/functions/process-webhook-message/index.ts           [MODIFICAR — só trecho de áudio]
supabase/functions/cleanup-tts-audios/index.ts                [NOVO]
supabase/config.toml                                          [+1 bloco verify_jwt]
SQL para cron job (insert direto, não migration)              [NOVO]
```

---

## Comportamento após deploy

| Etapa | Antes | Depois |
|---|---|---|
| `aura-tts` retorna | base64 inline | URL pública + base64 (compat) |
| `process-webhook-message` envia | `sendAudio(base64)` → falha silenciosa | `sendAudioUrl(url)` → entrega real |
| Storage usado | 0 | ~200-500KB por áudio, max 7 dias |
| Latência por áudio | ~2-4s | +0.5-1s (upload paralelo) |
| Áudios chegando aos usuários | ❌ 0 nos últimos 14 dias | ✅ Conforme orçamento mensal do plano |

## Riscos & mitigações
- **Storage crescendo**: mitigado pelo cron de limpeza diária (TTL 7 dias)
- **Bucket público expõe áudios**: aceitável — paths usam UUID aleatório, sem enumeração viável; áudios são pessoais mas não contêm credenciais
- **Build errors pré-existentes** no projeto (visíveis no `<build-errors>`): NÃO serão tocados — são problemas independentes em outras funções (`aura-agent`, `admin-engagement-metrics`, etc.). Esta mudança não os agrava nem corrige.

## Validação pós-deploy
1. Enviar mensagem que dispare áudio (ex: pedido de meditação ou trecho emocional em sessão)
2. Verificar logs do `aura-tts` → deve mostrar `audioUrl` populado
3. Verificar logs do `process-webhook-message` → deve mostrar `sendAudioUrl success`
4. Confirmar recebimento do áudio no WhatsApp do usuário de teste
5. Após 24h, verificar `token_usage_logs` filtrando `function_name = 'aura-tts'` → deve ter atividade

