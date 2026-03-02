

# Correcao: Edge Function timeout causa "Failed to fetch"

## Problema identificado

A funcao `run-system-tests` faz muitas chamadas sequenciais ao LLM (~25+ chamadas) que levam 2-3 minutos no total. A edge function excede o tempo limite de execucao e a conexao e perdida, causando "Failed to fetch" no frontend.

Pelos logs:
- Boot: 18:37:35
- Test 1 (Casual, 5 chamadas LLM): 18:37:45 - 18:39:12 (~1.5 min)
- Test 2 (Emotional, 4 chamadas LLM): 18:39:12 - shutdown 18:40:27 (~1.2 min)
- Nunca chegou ao Test 3 (Session, ~15 chamadas LLM)

## Solucao: Execucao por teste individual

Modificar a arquitetura para que o frontend chame cada teste individualmente em vez de todos de uma vez. Isso resolve o timeout porque cada teste individual leva 30-90 segundos.

### 1. Modificar `run-system-tests/index.ts`

Aceitar um parametro `test` no body que indica qual teste rodar:
- `casual` - Conversa casual (5 chamadas, ~90s)
- `emotional` - Conversa emocional (4 chamadas, ~60s)
- `session` - Sessao completa (15 chamadas, ~3min - precisa timeout maior)
- `report` - Relatorio semanal (~30s)
- `checkin` - Check-in (~30s)
- `followup` - Follow-up (~30s)
- `verdict` - Gera veredicto final a partir de resultados passados no body

Quando `test` nao e fornecido, retorna a lista de testes disponiveis.

### 2. Modificar `AdminTests.tsx`

Executar os testes sequencialmente no frontend, chamando a edge function uma vez por teste. Atualizar o progresso e resultados conforme cada teste completa. Ao final, chamar com `test: 'verdict'` passando todos os resultados para gerar o veredicto.

Para o teste de sessao completa (que pode exceder 60s), dividir em sub-testes ou reduzir o numero de mensagens simuladas para ~8-10 em vez de 15-20.

### 3. Reduzir mensagens do teste de sessao

Reduzir de 15-20 para 8-10 mensagens para caber no timeout:
- 2 mensagens de abertura
- 3 mensagens de exploracao  
- 2 mensagens de reframe
- 2 mensagens de encerramento

