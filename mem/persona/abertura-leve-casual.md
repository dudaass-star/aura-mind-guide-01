---
name: Abertura leve casual fora de sessão
description: Saudações puras e mensagens leves (≤8 palavras sem carga emocional) fora de sessão bloqueiam referência a memória/insights/compromissos; PADRÃO RECORRENTE só roda em sessão ativa
type: feature
---
Em `aura-agent/index.ts`, fora de sessão (`sessionActive === false`):

- **Saudação pura** (regex: `oi`, `olá`, `e aí`, `bom dia`, `tudo bem?`, etc., isolado) **ou** mensagem com ≤8 palavras sem palavras de carga emocional → injeta bloco `## ABERTURA LEVE DETECTADA` que **proíbe** referenciar memória, insights, evolution summary, compromissos pendentes, temas de sessões anteriores ou padrões observados. Máximo 2 balões.
- Mensagens curtas (≤5 palavras) que não disparam o bloco acima recebem **anti-eco suavizado**: espelha tamanho, só pergunta se houver gancho real, sem puxar tema novo ou antigo.
- Bloco `⚠️ PADRÃO RECORRENTE DE INAÇÃO DETECTADO` (confronto afetuoso por compromissos parados) só é injetado **dentro de sessão ativa**. Tracking continua no banco fora de sessão.

**Por quê:** Flash puxava tema antigo no "Oi" porque memória + evolution + confronto afetuoso vinham sempre no prompt, mesmo casual. Defesa em camadas: proibição explícita + anti-eco suavizado.

**Lista de carga emocional (regex):** `trist|ansios|medo|raiva|sozinh|cansad|perdid|chorand|surto|crise|ajuda|dor|peso|vazio|culp|angúst|pânico|desesper|sofr|deprim|chate|magoa|frustr|exaust|esgotad|ferid|ódio|odeio|mal\b`.