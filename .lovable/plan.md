

# Bugs na extração de dados em sessões retomadas

## Problemas encontrados

Existem **3 chamadas** a `calculateSessionTimeContext` que **não passam** `lastMessageAt`, ou seja, recalculam a fase usando o `started_at` original. Em sessões retomadas (gap >2h), essas chamadas retornam `phase = 'overtime'` em vez de `resuming`:

| Local | Linha | Recebe `lastMessageAt`? | Impacto |
|---|---|---|---|
| Detecção inicial (sessão normal) | 2771 | ✅ Sim | OK |
| Detecção inicial (sessão órfã) | 2828 | ✅ Sim | OK |
| **Reforço de fase no dynamicContext** | **3618** | ❌ Não | Phase block injeta `OVERTIME` em vez de `RESUMING` |
| **Log antes da chamada AI** | **3805** | ❌ Não | Log incorreto (menor impacto) |
| **Hard block** | **3877** | ❌ Não | Phase recalculada como `overtime`, mas `shouldEndSession` já é false — impacto menor |
| **Áudio de encerramento** | **4794** | ❌ Não | `forceAudioForClose = true` desnecessariamente |

### Bug principal: linha 3618

O `phaseBlock` injetado no `dynamicContext` é recalculado **sem** o `lastMessageAt`. Numa sessão de 8h retomada:
- A detecção inicial (linha 2771) calcula corretamente `isResuming = true`, `phase = 'development'`
- Mas o reforço determinístico (linha 3618) recalcula **sem** gap → `phase = 'overtime'` → injeta instruções de overtime

Resultado: a Aura recebe **instruções contraditórias** — o `timeContext` diz "retomada" mas o `phaseBlock` diz "TEMPO ESGOTADO. PROPONHA encerrar".

### Bug secundário: extração funciona mas com dados ruins

A extração em si (linhas 4380-4476) funciona corretamente quando `shouldEndSession = true` ou `aiWantsToEndSession = true`. Mas como o `phaseBlock` contraditório pode levar a Aura a incluir `[ENCERRAR_SESSAO]` prematuramente numa retomada, os insights extraídos seriam da mensagem de retomada — não de uma sessão completa.

## Mudanças

### 1. Passar `lastMessageAt` em todas as chamadas de `calculateSessionTimeContext` durante sessões ativas

Armazenar o valor de `lastMsg?.created_at` numa variável (`lastMessageTimestamp`) no escopo principal, e reutilizá-la em todas as chamadas subsequentes:

- **Linha 3618**: `calculateSessionTimeContext(currentSession)` → `calculateSessionTimeContext(currentSession, lastMessageTimestamp)`
- **Linha 3805**: mesma correção no log
- **Linha 3877**: mesma correção no hard block
- **Linha 4794**: mesma correção no bloco de áudio

### 2. Escopo da variável `lastMessageTimestamp`

Declarar `let lastMessageTimestamp: string | null = null;` junto com as outras variáveis de sessão (~linha 2733), e atribuir o valor na busca da última mensagem (~linhas 2768 e 2823).

## Resumo

| Antes | Depois |
|---|---|
| Sessão retomada após 8h → phaseBlock diz "OVERTIME" | phaseBlock diz "RETOMADA" com 20 min |
| Instruções contraditórias para a IA | Todas as camadas consistentes |
| Aura pode encerrar na primeira resposta após retomada | Aura retoma naturalmente |

