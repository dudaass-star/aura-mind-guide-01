---
name: Áudio forçado quando mandatory
description: splitIntoMessages força áudio quando audioDecision.mandatory=true, independente da tag [MODO_AUDIO]
type: feature
---
A função `splitIntoMessages` em `aura-agent/index.ts` recebe a `AudioDecision` completa. Quando `audioDecision.mandatory === true` (abertura de sessão, fechamento, crise detectada, pedido explícito do usuário), o áudio é forçado mesmo se a IA esquecer a tag `[MODO_AUDIO]`. Isso elimina a dependência da memória do LLM para gatilhos determinísticos. A tag continua válida para áudios "espontâneos" da Aura em conversas casuais (`ai_decision`). Log `🎙️ FORCED audio (no AI tag): reason=...` rastreia disparos sem tag.
