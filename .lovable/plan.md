

# Correcao dos testes: respostas vazias + timeout da sessao

## Problemas identificados

### 1. Respostas vazias em todos os testes (casual + emocional)
O `aura-agent` retorna `{ messages: [{ text, delay, isAudio }] }`, mas o `run-system-tests` procura por `data.reply || data.response || ''` -- campos que nao existem. Por isso todas as respostas sao strings vazias.

**Correcao:** Alterar a extracao da resposta em todos os testes para:
```typescript
const data = await res.json();
const reply = (data.messages || []).map((m: any) => m.text).join(' ||| ') || '';
```

### 2. Teste de sessao ainda excede timeout
9 mensagens sequenciais ao LLM (~20s cada) = ~180s, que excede o limite da edge function. O teste `casual` com 5 msgs ja leva ~108s.

**Correcao:** Dividir o teste de sessao em 2 partes chamadas separadamente do frontend:
- `session_part1` (abertura + exploracao = 5 msgs)
- `session_part2` (reframe + encerramento + validacoes = 4 msgs + cleanup)

O frontend chama `session_part1` primeiro (que retorna a session_id criada), depois `session_part2` passando o session_id. Os resultados sao mesclados no frontend.

## Mudancas

### `supabase/functions/run-system-tests/index.ts`
1. Corrigir extracao de resposta do `aura-agent` em `testCasualConversation`, `testEmotionalConversation` e `testFullSession` -- trocar `data.reply || data.response || ''` por concatenacao dos `data.messages[].text`
2. Dividir `testFullSession` em `testSessionPart1` e `testSessionPart2`, onde part1 cria sessao + envia abertura/exploracao e part2 continua com reframe/encerramento + validacoes + cleanup
3. Registrar `session_part1` e `session_part2` em `AVAILABLE_TESTS`

### `src/pages/AdminTests.tsx`
1. Atualizar `TEST_QUEUE` para incluir `session_part1` e `session_part2` em vez de `session`
2. Passar o `session_id` retornado por `session_part1` no body de `session_part2`
3. Mesclar as validacoes das duas partes em um unico card de resultado "Sessao Completa"

