---
name: Gravador único de compromissos com dedupe semântico
description: Compromissos são gravados só em postConversationAnalysis via saveCommitmentsDeduped (dedupe por 50% de sobreposição de palavras-chave, teto de 1 por sessão, filtro de autoria); o micro-agent não insere mais.
type: feature
---
**Problema original:** dois gravadores independentes (micro-agent `processAgentActions` + `postConversationAnalysis`) usavam o mesmo dedupe frágil (ILIKE nos 40 primeiros chars) e corriam entre si. Resultado real: 18 compromissos para uma única usuária em 2 sessões, sendo o mesmo "Termômetro" 8 vezes, além de falas da própria AURA e frases sarcásticas viradas compromisso.

**Regra atual (`aura-agent/index.ts`):**
- O micro-agent NÃO insere compromissos — apenas loga que ignorou. Gravação centralizada em `postConversationAnalysis` → `saveCommitmentsDeduped()`.
- `isValidUserCommitment()` rejeita: título < 8 chars, começa com "AURA", "AURA ... vai", contém "?", e padrões de ruído (menos enrolada, responder por áudio, gravar no seu HD, sei lá).
- Dedupe semântico: normaliza (lowercase, sem acento, sem stopwords) e compara com pendentes dos últimos 30 dias; sobreposição ≥ 50% das palavras-chave → UPDATE do título existente em vez de novo INSERT.
- Teto: 1 compromisso ativo por `session_id`.

**Prompt do extractor:** `commitments` deve conter só ação do USUÁRIO em 1ª pessoa; nunca fala/pergunta da assistente, nunca algo que a AURA vai fazer, nunca reclamação/sarcasmo.
