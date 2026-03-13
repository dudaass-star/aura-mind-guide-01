# Fix: lastMessageTimestamp consistente em todas as chamadas — Implementado ✅

## Problema
4 chamadas a `calculateSessionTimeContext` não recebiam `lastMessageAt`, recalculando a fase com base no `started_at` original. Em sessões retomadas (gap >2h), isso gerava `phase = 'overtime'` em vez de `resuming`, criando instruções contraditórias para a IA.

## O que foi feito

1. **Variável `lastMessageTimestamp`** declarada no escopo principal (junto com `shouldEndSession` etc.)
2. **Atribuída** nos dois pontos onde `lastMsg` é buscado (sessão normal e sessão órfã)
3. **Passada** em todas as 4 chamadas que faltavam:
   - Reforço de fase no `dynamicContext` (phaseBlock)
   - Log antes da chamada AI
   - Hard block pós-resposta
   - Controle de áudio de encerramento

## Resultado
Todas as camadas (timeContext, phaseBlock, hard block, áudio) agora calculam a fase de forma consistente. Sessões retomadas após gap >2h recebem `phase = 'development'` + `isResuming = true` em vez de `overtime`.
