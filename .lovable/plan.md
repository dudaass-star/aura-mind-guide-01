

# Fix: Escopo de `agentData` + Guard de Contingência Falsa

## Análise

O problema das "mensagens em sequência respondidas uma vez só" **já está implementado** e funciona corretamente (linhas 612-640 do `process-webhook-message`). O sistema de debounce acumula mensagens sequenciais e as agrupa antes de chamar o agente.

O que acontece é que **o bug de escopo mascara tudo**: a Aura responde corretamente às mensagens acumuladas, mas depois o código quebra ao tentar ler `agentData` fora do `try` interno, disparando a mensagem de "probleminha técnico" — o que dá a impressão de que algo está errado com o processamento em si.

## Causa Raiz (única)

```text
Linha 654:  try {                          ← agentData declarado aqui (L679)
Linha 824:  } finally { ... }
Linha 837:  return ... agentData.messages   ← FORA do try → ReferenceError
Linha 846:  } catch {                       ← captura o erro → envia "probleminha técnico"
```

## Correção

### `supabase/functions/process-webhook-message/index.ts`

1. **Mover declaração de `agentData`** para antes do `try` interno (escopo acessível pelo `return` final)
   - `let agentData: any = null;` declarado junto com `wasInterrupted` (linha ~651)

2. **Adicionar flag `sentAnyResponse`** para impedir contingência falsa
   - Incrementar a cada `sendTextMessage` bem-sucedido no loop de envio
   - No `catch` externo: só enviar "probleminha técnico" se `sentAnyResponse === false`

3. **Persistir respostas normais** no banco
   - Após enviar cada balão com sucesso, inserir na tabela `messages` com `role: 'assistant'`
   - Garante que o painel admin mostra o que realmente foi entregue

### Resultado
- Zero mensagens fantasma de "probleminha técnico" após respostas bem-sucedidas
- Mensagens em sequência continuam sendo agrupadas e respondidas de uma vez (já funciona)
- Histórico de mensagens no painel fica completo

### 1 arquivo editado
- `supabase/functions/process-webhook-message/index.ts`

