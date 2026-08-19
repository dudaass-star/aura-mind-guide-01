---
name: Abertura leve casual fora de sessão
description: Só saudação pura dispara o bloco de abertura leve; mensagens ≤8 palavras caem no LEMBRETE ANTI-ECO (que proíbe memória/insights); PADRÃO RECORRENTE só roda em sessão ativa
type: feature
---
Em `aura-agent/index.ts`, fora de sessão (`sessionActive === false`):

- **Só saudação pura** (regex: `oi`, `olá`, `e aí`, `bom dia`, `tudo bem?`, etc., isolado) → injeta bloco `## ABERTURA LEVE DETECTADA` que **proíbe** referenciar memória, insights, evolution summary, compromissos pendentes, temas de sessões anteriores ou padrões observados. Máximo 2 balões.
- **O ramo antigo de ≤8 palavras sem carga emocional foi REMOVIDO** — ele engolia pergunta prática curta ("pilates faz mais efeito que musculação?", 6 palavras) e forçava resposta de cumprimento, matando a utilidade no dia a dia. Não reintroduzir.
- Mensagens curtas (**≤8 palavras**) que não são saudação recebem **anti-eco suavizado**: espelha tamanho, responde direto se for pergunta prática, só pergunta se houver gancho real, e **não referencia memória/insights/compromissos/temas anteriores** (essa proibição migrou do ramo removido, para não abrir lacuna na faixa 6-8 palavras).
- Bloco `⚠️ PADRÃO RECORRENTE DE INAÇÃO DETECTADO` (confronto afetuoso por compromissos parados) só é injetado **dentro de sessão ativa**. Tracking continua no banco fora de sessão.

**Por quê:** Flash puxava tema antigo no "Oi" porque memória + evolution + confronto afetuoso vinham sempre no prompt, mesmo casual. Defesa em camadas: proibição explícita + anti-eco suavizado.

**Lista de carga emocional (regex):** agora é a constante módulo-level `EMOTIONAL_LOAD_REGEX`, compartilhada com `isPracticalQuestion` — ver `mem://persona/utilidade-dia-a-dia`.

## Despoluição Fase 2A (complementa a Fase 1)

- **`🔚 FECHAMENTO RECOMENDADO`** só injeta quando `sessionActive === true`. Fora de sessão, mesmo com `selectClosureRoute` retornando route ≠ 'none', o bloco não vai pro prompt — evita que "Oi" puxe tema antigo via sugestão de fechamento.
- **`🟢 CONFIRMAÇÃO DE PLANO ATUAL`** (10 linhas com "REGRAS ABSOLUTAS") foi colapsado em 1 linha dentro do bloco `## Dados do Usuário`. Caso de cota esgotada virou bloco `## SESSÕES ESGOTADAS NO CICLO` com 3 linhas, generalizado pra qualquer plano (não só Essencial).
- **`## REGRAS DE CONTINUIDADE (OBRIGATÓRIAS)`** duplicado no `continuityContext` foi removido. Os scripts literais ("Na nossa última conversa você tinha falado sobre X...") eram parte do problema de "puxar tema antigo". Continuidade fica só nos 2 caminhos gated por fase: estático `# SESSÕES ESPECIAIS` + dinâmico `calculateSessionTimeContext` fase opening.
- **`## CONTROLE DE TEMPO DA SESSÃO`** (stub de 2 linhas no estático) removido — só apontava pro bloco dinâmico já completo.