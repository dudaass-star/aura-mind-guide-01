

## Debounce inteligente: Agrupar mensagens consecutivas sem aumentar delay

### Contexto
Quando o usuario envia 3 mensagens seguidas, cada uma dispara o webhook-zapi separadamente, e cada uma chama o aura-agent. O sistema de interrupcao atual para as bubbles, mas nao impede 3 chamadas separadas ao agente.

### Opcao descartada: Webhook de "digitando"
O Z-API tem um webhook `on-chat-presence` com status `COMPOSING` que notifica quando o usuario esta digitando. Porem:
- Requer configurar um novo webhook no Z-API
- O evento pode nao chegar a tempo (race condition)
- O usuario pode enviar mensagens sem que o status "digitando" apareca (ex: mensagens de voz, copiar/colar)
- Adiciona complexidade desnecessaria

### Solucao escolhida: Debounce por verificacao de ID (sem mudar delay)

A solucao e simples: **manter o delay atual de 1.5-3.5s** e adicionar uma unica verificacao apos ele. Se uma mensagem mais recente chegou durante o delay, este webhook aborta silenciosamente.

**Arquivo:** `supabase/functions/webhook-zapi/index.ts`

**Unica mudanca** -- adicionar ~10 linhas apos a linha 516 (apos o `await` do delay):

```typescript
// Linha 516 existente:
await new Promise(resolve => setTimeout(resolve, initialDelay));

// NOVO: Debounce check - verificar se outra mensagem chegou durante o delay
const { data: debounceCheck } = await supabase
  .from('aura_response_state')
  .select('last_user_message_id')
  .eq('user_id', profile.user_id)
  .maybeSingle();

if (debounceCheck?.last_user_message_id && 
    debounceCheck.last_user_message_id !== currentMessageId) {
  console.log(`⏭️ DEBOUNCE: Msg mais recente detectada (${debounceCheck.last_user_message_id} != ${currentMessageId}). Abortando.`);
  return new Response(JSON.stringify({ status: 'debounced' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Codigo existente continua aqui (CALL AURA AGENT)
```

### Como funciona

```text
Msg 1 chega -> salva ID_1 no banco -> delay ~2s
  (durante esse delay, Msg 2 chega -> salva ID_2 no banco -> delay ~2s)
    (durante esse delay, Msg 3 chega -> salva ID_3 no banco -> delay ~2s)

Msg 1 acorda -> le banco: ID_3 != ID_1 -> ABORTA
Msg 2 acorda -> le banco: ID_3 != ID_2 -> ABORTA
Msg 3 acorda -> le banco: ID_3 == ID_3 -> chama aura-agent (com 3 msgs no historico)
```

### Por que funciona sem aumentar o delay
- Mensagens consecutivas no WhatsApp chegam em intervalos de 0.5-2 segundos
- O delay atual de 1.5-3.5s ja cobre a maioria dos casos
- Se o usuario mandar 3 mensagens em 4 segundos e o delay for 1.5s, a Msg 1 pode nao ser debounced -- mas o sistema de interrupcao existente cuida desse caso como fallback

### Impacto
- Zero mudanca no tempo de resposta da Aura
- Apenas 1 query extra ao banco (leitura simples por primary key)
- Reduz chamadas ao agente de 3 para 1 em mensagens consecutivas
- Menos custo de tokens
