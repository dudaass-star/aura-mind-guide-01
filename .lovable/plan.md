

# Fix: Mensagens sequenciais não acumuladas — Worker 1 chama o agente antes da msg 2 chegar

## Diagnóstico

Olhando os logs com timestamps:

```text
08.519  Worker 1 boot (msg: "Mas vc tá ficando mto no treino...")
09.336  Worker 1 recebe resposta do agente (só com msg 1)
09.680  Worker 1 começa a enviar bubbles
12.911  Msg 2 chega no webhook ("A vida não é só treino")
13.369  Worker 2 boot
14.950  Worker 2 persiste msg 2, vê lock ocupado, aborta
```

**O problema**: Worker 1 fez o delay inicial (~1.5s), checou acumulação, encontrou só 1 mensagem, chamou o agente e já estava enviando bubbles quando a msg 2 chegou 5 segundos depois. A acumulação funciona — mas só se as msgs já estiverem no banco no momento da checagem.

O delay inicial (1.5-3.5s) é curto demais para pegar msgs que chegam 5s depois.

## Solução: Re-acumulação pós-agente

Após receber a resposta do agente, **antes de enviar a primeira bubble**, verificar se novas mensagens do usuário chegaram enquanto o agente processava. Se sim:
1. Re-acumular todas as msgs
2. Re-chamar o agente com o texto completo

Isso cobre o cenário onde msg 2 chega durante o processamento do agente (que leva 1-3s).

### Mudança em `process-webhook-message/index.ts`

Após a linha 796 (`console.log('🤖 Agent response:' ...)`), antes do bloco "UPDATE CONVERSATION TRACKING" (linha 798), inserir:

```typescript
// ========================================================================
// RE-ACUMULAÇÃO PÓS-AGENTE
// ========================================================================
// Verifica se novas msgs do usuário chegaram enquanto o agente processava.
// Se sim, re-acumula e re-chama o agente com o texto completo.
// ========================================================================
const { data: postAgentMsgs } = await supabase
  .from('messages')
  .select('content, created_at')
  .eq('user_id', profile.user_id)
  .eq('role', 'user')
  .gt('created_at', lastAssistantMsg?.created_at || '1970-01-01')
  .order('created_at', { ascending: true });

if (postAgentMsgs && postAgentMsgs.length > recentUserMsgs?.length) {
  const newAccumulatedText = postAgentMsgs.map(m => m.content).join('\n');
  if (newAccumulatedText !== messageText) {
    console.log(`📦 Re-acumulação: ${postAgentMsgs.length} msgs (antes: ${recentUserMsgs?.length || 1}). Re-chamando agente...`);
    messageText = newAccumulatedText;
    // Re-chamar o agente com texto acumulado
    agentData = await callAuraAgent(false);
    console.log('🤖 Agent re-response:', JSON.stringify(agentData, null, 2));
  }
}
```

### Por que isso resolve

- **Cenário normal (1 msg)**: A re-checagem encontra o mesmo número de msgs → nenhuma re-chamada
- **Cenário de msgs rápidas**: Msg 2 chega enquanto o agente processa msg 1. Após o agente retornar, a re-checagem encontra 2 msgs → re-chama com texto combinado
- **Sem impacto no UX**: Não aumenta o delay para msgs únicas. Só adiciona ~100ms de query extra

### Limitação

Se a msg 2 chegar **depois** que o agente respondeu E a re-checagem já passou, ainda não será capturada. Mas isso cobre o caso mais comum (msgs com 3-10s de intervalo).

## Variáveis necessárias

A variável `recentUserMsgs` (definida na linha 714) e `lastAssistantMsg` (linha 694) precisam estar acessíveis no escopo onde vamos inserir o código. Ambas já estão no mesmo bloco `try`, então não há problema.

## Deploy

Fazer deploy da function `process-webhook-message` após a alteração.

