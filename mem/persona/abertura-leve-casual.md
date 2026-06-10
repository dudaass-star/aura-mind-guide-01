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

## Despoluição Fase 2A (complementa a Fase 1)

- **`🔚 FECHAMENTO RECOMENDADO`** só injeta quando `sessionActive === true`. Fora de sessão, mesmo com `selectClosureRoute` retornando route ≠ 'none', o bloco não vai pro prompt — evita que "Oi" puxe tema antigo via sugestão de fechamento.
- **`🟢 CONFIRMAÇÃO DE PLANO ATUAL`** (10 linhas com "REGRAS ABSOLUTAS") foi colapsado em 1 linha dentro do bloco `## Dados do Usuário`. Caso de cota esgotada virou bloco `## SESSÕES ESGOTADAS NO CICLO` com 3 linhas, generalizado pra qualquer plano (não só Essencial).
- **`## REGRAS DE CONTINUIDADE (OBRIGATÓRIAS)`** duplicado no `continuityContext` foi removido. Os scripts literais ("Na nossa última conversa você tinha falado sobre X...") eram parte do problema de "puxar tema antigo". Continuidade fica só nos 2 caminhos gated por fase: estático `# SESSÕES ESPECIAIS` + dinâmico `calculateSessionTimeContext` fase opening.
- **`## CONTROLE DE TEMPO DA SESSÃO`** (stub de 2 linhas no estático) removido — só apontava pro bloco dinâmico já completo.