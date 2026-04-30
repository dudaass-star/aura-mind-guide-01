# Plano A — Restaurar envios de áudio da Aura

## Problema

Nos últimos 7 dias: ~8.300 mensagens enviadas pela Aura, apenas **4 áudios**. Sessões completas estão saindo com `audio_sent_count = 0` mesmo na abertura/fechamento (que são obrigatórios). Crises e pedidos explícitos do usuário também viram texto.

## Causa raiz

O backend (`determineAudioMode()`) decide corretamente quando o áudio é obrigatório (`mandatory: true`), mas a função `splitIntoMessages()` só ativa modo áudio se a IA escrever literalmente `[MODO_AUDIO]` no início da resposta. Quando a IA esquece a tag, **toda a regra determinística é ignorada** e a mensagem vai como texto.

```text
determineAudioMode → mandatory: true ✅
       │
       ▼
splitIntoMessages → checa só a TAG ❌  → vai como texto
```

## Mudanças

### 1. `supabase/functions/aura-agent/index.ts` — `splitIntoMessages()` (linha 3273)

Trocar a assinatura para receber a `AudioDecision` completa em vez de só `allowAudioThisTurn`. Forçar `isAudioMode = true` sempre que `audioDecision.mandatory === true`, independente da tag.

```ts
// ANTES
function splitIntoMessages(response, allowAudioThisTurn) {
  const wantsAudioByTag = response.trimStart().startsWith('[MODO_AUDIO]');
  const isAudioMode = wantsAudioByTag && allowAudioThisTurn;
  ...
}

// DEPOIS
function splitIntoMessages(response, audioDecision) {
  const wantsAudioByTag = response.trimStart().startsWith('[MODO_AUDIO]');
  const isAudioMode = audioDecision.mandatory
    || (wantsAudioByTag && audioDecision.shouldUseAudio);

  if (audioDecision.mandatory && !wantsAudioByTag) {
    console.log(`🎙️ FORCED audio (no AI tag): reason=${audioDecision.reason}`);
  }
  ...
}
```

### 2. Atualizar a chamada (linha 7121)

```ts
const messageChunks = splitIntoMessages(assistantMessage, audioDecision);
```

### 3. Garantir limpeza da tag em qualquer caminho

A linha 42 já remove `[MODO_AUDIO]`. Confirmar que `stripAllInternalTags` (já chamado em `splitIntoMessages`) cobre o caso "áudio forçado sem tag" — sem duplicação de conteúdo.

### 4. Logs de auditoria

Adicionar log estruturado quando o áudio for forçado pelo backend, para acompanhar o efeito da mudança nos primeiros dias:
```
🎙️ FORCED audio (no AI tag): reason=session_opening|session_closing|crisis_detected|user_requested
```

## Comportamento resultante

| Situação | Antes | Depois |
|---|---|---|
| Abertura de sessão (msg 1 e 2) | só com tag | **sempre áudio** |
| Fechamento de sessão | só com tag | **sempre áudio** |
| Crise detectada (pânico, ideação) | só com tag | **sempre áudio** |
| Usuário pede áudio explícito | só com tag | **sempre áudio** |
| Aura "sente" momento emocional casual | tag (igual) | tag (igual) |
| Usuário pediu texto | texto | texto (inalterado) |
| Orçamento mensal estourado | bloqueia | bloqueia (inalterado para não-mandatórios; mandatórios passam — comportamento já existente em `determineAudioMode`) |

## Validação pós-deploy

Após 24–48h, conferir:
1. `SELECT COUNT(*) FROM token_usage_logs WHERE service = 'inworld_tts' AND created_at > now() - interval '24 hours'` — esperado: dezenas, não 0–1.
2. `SELECT id, audio_sent_count FROM sessions WHERE status = 'completed' AND ended_at > now() - interval '24 hours'` — esperado: todas com `audio_sent_count >= 2`.
3. Logs do `aura-agent` filtrar por `🎙️ FORCED audio` para mapear quais reasons estão disparando.

## Não está no escopo

- Fallback Inworld → Google TTS (item separado, decidido depois).
- Mudar limites de orçamento mensal por plano.
- Mudar critérios de detecção de crise/pedido de áudio.
- Cap diário de áudios forçados (essa era a opção B, descartada).

## Risco aceito

Custo Inworld TTS sobe (já discutido). Mitigado pelo orçamento mensal por usuário, que continua funcionando.
