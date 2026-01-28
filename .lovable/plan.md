

# Plano: Corrigir Timeout do Cliente na Geração de Chunks

## Problema Identificado

A geração está funcionando corretamente no backend, mas o **frontend perde a conexão** antes da Edge Function completar. O chunk 2 ficou travado em "generating" porque:

1. A geração de áudio TTS está levando ~90 segundos por chunk (mais lento que estimado)
2. O navegador tem timeout de ~60-120s e desiste de esperar
3. O loop do frontend quebra ao perder conexão

**Boa notícia**: O banco de dados salvou todo o progresso! Chunks 0 e 1 estão completos.

## Solução Proposta

Implementar um padrão **"fire and forget"** onde o frontend dispara a geração e monitora via polling, em vez de aguardar cada resposta.

## Mudanças Técnicas

### 1. Atualizar a Edge Function `generate-chunk`

Adicionar um modo assíncrono que retorna imediatamente após iniciar a geração:

```typescript
// Retorna imediatamente se async=true
if (body.async) {
  // Iniciar geração em background (não bloqueia resposta)
  EdgeRuntime.waitUntil(processChunk(meditation_id, chunk_index));
  return new Response(JSON.stringify({ 
    success: true, 
    async: true,
    message: 'Generation started' 
  }));
}
```

### 2. Refatorar a Orquestração no Frontend

Em vez de esperar cada chunk:

```typescript
// ANTES: Espera resposta de cada chunk
for (let i = 0; i < totalChunks; i++) {
  await supabase.functions.invoke("generate-chunk", {...}); // Bloqueia 90s!
}

// DEPOIS: Dispara e monitora via polling
for (let i = 0; i < totalChunks; i++) {
  await supabase.functions.invoke("generate-chunk", { 
    body: { ..., async: true } // Retorna imediatamente
  });
  
  // Aguarda chunk completar via polling do banco
  await waitForChunkCompletion(meditationId, i);
}
```

### 3. Adicionar Função de Espera com Polling

```typescript
const waitForChunkCompletion = async (meditationId: string, chunkIndex: number): Promise<boolean> => {
  const maxWait = 180000; // 3 minutos
  const pollInterval = 3000; // 3 segundos
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const { data } = await supabase
      .from('meditation_audio_chunks')
      .select('status')
      .eq('meditation_id', meditationId)
      .eq('chunk_index', chunkIndex)
      .single();

    if (data?.status === 'completed') return true;
    if (data?.status === 'failed') throw new Error('Chunk failed');

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error('Chunk timeout');
};
```

### 4. Corrigir Status de Chunks Travados

Ao retomar, verificar se há chunks "generating" sem progresso e resetá-los:

```typescript
// Se chunk está "generating" há mais de 5 minutos, resetar para "pending"
const stuckChunks = chunks.filter(c => 
  c.status === 'generating' && 
  Date.now() - new Date(c.created_at).getTime() > 300000
);
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/generate-chunk/index.ts` | Adicionar modo async com `waitUntil` |
| `src/pages/AdminMeditations.tsx` | Refatorar para polling em vez de espera síncrona |

## Vantagens

- **Sem timeout de conexão**: Frontend não precisa manter conexão longa
- **Mais resiliente**: Se navegador fechar, geração continua
- **Feedback em tempo real**: Polling atualiza UI a cada 3s
- **Retomável**: Chunks travados podem ser resetados

## Ação Imediata

Antes de implementar, você pode **retomar a geração agora** na página admin:
- Clique em "Atualizar" para ver o status atual
- Deve aparecer "Pausado (2/6)" para essa meditação
- Clique em "Retomar" para continuar do chunk 2

