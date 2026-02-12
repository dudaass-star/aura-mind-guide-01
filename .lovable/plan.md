## Garantir que a AURA Respeite as Fases e o Tempo da Sessao

### Diagnostico

A funcao `calculateSessionTimeContext` calcula as fases corretamente:

```text
0-5 min   -> Abertura
5-25 min  -> Exploracao Profunda
25-35 min -> Reframe e Insights
35 min+   -> Transicao / Fechamento / Encerramento (baseado em timeRemaining)
```

No caso do Lucas, aos 17 minutos a AURA estava na fase "Exploracao" e o sistema informou isso corretamente no contexto. Porem, a AURA decidiu fechar a sessao mesmo assim. O problema e que **nao existe nenhuma trava no codigo** -- todo o controle e apenas via prompt, e a IA pode ignorar.

### Problemas Identificados

**1. Sem trava contra encerramento prematuro**
A AURA pode usar `[ENCERRAR_SESSAO]` ou `[CONVERSA_CONCLUIDA]` a qualquer momento, mesmo no meio da exploracao. O codigo aceita e processa sem questionar.

**2. Prompt nao proibe explicitamente encerramento fora de fase**
As instrucoes de cada fase dizem o que fazer, mas nao dizem "NUNCA encerre nesta fase". A AURA interpreta como sugestao, nao como regra.

**3. `[CONVERSA_CONCLUIDA]` aceita durante sessao ativa**
A AURA usou `[CONVERSA_CONCLUIDA]` (tag de conversa casual) durante uma sessao ativa. O codigo deveria rejeitar essa tag quando ha sessao em andamento.

### Solucao em 3 Camadas

#### Camada 1: Trava no Codigo (Hard Block)

No `aura-agent`, apos receber a resposta da IA, verificar:

- Se ha sessao ativa E a fase atual e anterior a `transition` (ou seja, `opening`, `exploration`, `reframe`, `development`)
- E a resposta contem `[ENCERRAR_SESSAO]` ou `[CONVERSA_CONCLUIDA]`
- Entao **remover a tag** e adicionar uma nota no log ("Tentativa de encerramento prematuro bloqueada")
- Isso impede que a sessao seja encerrada antes do tempo

#### Camada 2: Reforco no Prompt por Fase

Adicionar em CADA fase (opening, exploration, reframe) uma regra explicita:

```
PROIBIDO: Nao use [ENCERRAR_SESSAO] nem [CONVERSA_CONCLUIDA] nesta fase.
Voce tem XX minutos restantes. USE-OS.
```

E na fase de exploration especificamente, adicionar:

```
REGRA DE TEMPO: Voce esta na fase de exploracao (5-25 min).
NAO FACA resumos, NAO FACA fechamentos, NAO diga "nossa sessao esta terminando".
Se sentir que "ja explorou o suficiente", va MAIS FUNDO no mesmo tema ou abra outra camada.
```

#### Camada 3: Rejeitar `[CONVERSA_CONCLUIDA]` Durante Sessao

No codigo que processa as tags da resposta, se `sessionActive === true` e a resposta contem `[CONVERSA_CONCLUIDA]`:

- Substituir por `[ENCERRAR_SESSAO]` se estiver em fase de fechamento
- Ignorar completamente se estiver em fase anterior

### Detalhes Tecnicos

**Arquivo: `supabase/functions/aura-agent/index.ts**`

**Mudanca 1 - Trava de encerramento prematuro (~apos linha 3174, onde a resposta da IA e processada):**

- Apos receber `aiReply`, verificar se `sessionActive && currentSession`
- Calcular a fase atual via `calculateSessionTimeContext(currentSession)`
- Se fase e `opening`, `exploration`, `reframe` ou `development` E a resposta contem `[ENCERRAR_SESSAO]` ou `[CONVERSA_CONCLUIDA]`:
  - Remover as tags da resposta
  - Logar: "Blocked premature session closure at phase: {phase}"
  - A sessao continua normalmente

**Mudanca 2 - Adicionar proibicao explicita nas fases (linhas 1282-1342):**

- Na fase `opening` (apos linha 1317): adicionar "PROIBIDO: [ENCERRAR_SESSAO] e [CONVERSA_CONCLUIDA] nesta fase."
- Na fase `exploration` (apos linha 1341): adicionar "PROIBIDO: [ENCERRAR_SESSAO] e [CONVERSA_CONCLUIDA] nesta fase. Voce tem {timeRemaining} minutos. Va mais fundo."
- Na fase `reframe` (apos linha 1351): adicionar "PROIBIDO: [ENCERRAR_SESSAO] e [CONVERSA_CONCLUIDA] nesta fase."

**Mudanca 3 - Rejeitar `[CONVERSA_CONCLUIDA]` durante sessao (~linhas 3400-3450, onde as tags sao processadas):**

- Se `sessionActive` e resposta contem `[CONVERSA_CONCLUIDA]`:
  - Se fase >= `transition`: converter para `[ENCERRAR_SESSAO]`
  - Se fase < `transition`: remover a tag, nao encerrar

**Re-deploy:** Apenas `aura-agent` precisa ser re-deployed.

### Resultado Esperado

- AURA nunca consegue encerrar uma sessao antes da fase de transicao (35 min em sessao de 45)
- Se a IA tentar fechar cedo, a tag e removida silenciosamente e a sessao continua
- O prompt reforça em cada fase que o encerramento e proibido antes da hora
- `[CONVERSA_CONCLUIDA]` durante sessao ativa e tratado corretamente (convertido ou ignorado)