

# Por que as mensagens duplicam e como corrigir de vez

## Por que é difícil

O problema de duplicação tem **múltiplas causas simultâneas**, o que faz parecer que cada correção resolve, mas a duplicação reaparece por outro caminho. Aqui estão as 3 brechas que encontrei:

### Brecha 1: Mensagem salva ANTES do lock

No `process-webhook-message`, a mensagem do usuário é inserida na tabela `messages` na **linha 284** (antes do lock na linha 345). Se dois workers chegam quase ao mesmo tempo:
- Worker A salva a mensagem no banco, adquire o lock, processa
- Worker B salva a MESMA mensagem no banco de novo, tenta o lock, falha, aborta
- Resultado: mensagem do usuário duplicada no banco → o agente vê 2x a mesma mensagem no contexto → pode gerar resposta "dupla" no próximo turno

### Brecha 2: Sem dedup quando messageId é nulo

No `webhook-zapi`, o dedup só funciona se `payload.messageId` existe (linha 80: `if (payload.messageId)`). Se o Z-API manda algum evento sem messageId, o dedup é completamente ignorado e dois workers podem ser disparados.

### Brecha 3: Z-API manda múltiplos eventos para a mesma mensagem

O Z-API pode enviar diferentes tipos de callback (received, delivered, read) para a mesma mensagem. O payload pode ter estrutura similar e passar por todos os filtros. Mesmo com dedup por messageId, se o ID for diferente entre callbacks, ambos passam.

## Correções

### 1. Mover persistência DEPOIS do lock (`process-webhook-message`)

Mover o bloco de insert da mensagem do usuário (linhas 281-297) para DEPOIS da aquisição do lock (após linha 378). Assim, só o worker que ganha o lock persiste a mensagem. Workers abortados não poluem o banco.

### 2. Dedup por conteúdo quando messageId é nulo (`process-webhook-message`)

Após adquirir o lock, antes de processar, verificar se já existe uma mensagem idêntica do usuário nos últimos 30 segundos:

```typescript
const { data: recentDup } = await supabase
  .from('messages')
  .select('id')
  .eq('user_id', profile.user_id)
  .eq('role', 'user')
  .eq('content', messageText)
  .gte('created_at', new Date(Date.now() - 30000).toISOString())
  .limit(1)
  .maybeSingle();

if (recentDup) {
  console.log('⏭️ DEDUP: Mensagem idêntica encontrada nos últimos 30s, abortando');
  await releaseLock();
  return ...;
}
```

### 3. Filtrar eventos irrelevantes no webhook-zapi

Adicionar early exit no `webhook-zapi` para ignorar payloads que não têm texto, áudio nem imagem (são apenas status updates):

```typescript
if (!payload.text && !payload.hasAudio && !payload.hasImage) {
  console.log('⏭️ Ignoring status-only event (no content)');
  return new Response(...);
}
```

## Arquivos editados
- `supabase/functions/process-webhook-message/index.ts` — mover persistência + dedup por conteúdo
- `supabase/functions/webhook-zapi/index.ts` — filtrar eventos sem conteúdo

## Resultado esperado
- Mesmo que Z-API envie o webhook 2x, apenas 1 mensagem é salva e 1 resposta é gerada
- Workers que perdem o lock não deixam lixo no banco
- Eventos de status (sem conteúdo) são descartados antes de disparar o worker

