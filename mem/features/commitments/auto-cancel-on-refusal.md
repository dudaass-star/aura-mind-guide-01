---
name: Auto-cancelamento de commitments por recusa
description: Post-analysis Flash-lite extrai cancel_topics quando usuário recusa um tópico; commitments pendentes com title/description matching são marcados como cancelled no mesmo turno.
type: feature
---
**Regra:** No `aura-agent/index.ts > postConversationAnalysis`, o extractor recebe a regra 6: se o usuário expressar recusa/desinteresse/pedido pra parar (ex: "não quero", "já disse que não", "para de insistir"), preencher `cancel_topics: string[]` com palavras-chave curtas (1-3 palavras, minúsculas).

**Handler:** Após processar corrections, faz UPDATE em `commitments` SET commitment_status='cancelled', completed=true WHERE user_id=X AND commitment_status='pending' AND (title ILIKE %topic% OR description ILIKE %topic%) para cada tópico.

**Por quê:** Antes, recusa virava mais um commitment pendente, que alimentava o bloco "padrão recorrente" do prompt → Aura insistia no próximo turno. Agora a recusa zera o combustível no mesmo ciclo.

**Dedupe existente:** A criação de commitments já checa via ILIKE prefix de 40 chars (linha ~1652), evitando duplicatas com `completed=false`.
