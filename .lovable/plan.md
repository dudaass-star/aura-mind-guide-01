

# Adicionar delay adaptativo no AdminTests.tsx

## Problema
Os testes automatizados disparam 7+ chamadas rápidas, estourando o rate limit da Anthropic (~55k tokens × 7 = ~385k tokens em segundos).

## Solução
No `AdminTests.tsx`, antes de iniciar os testes, ler o modelo ativo do banco. Se for `anthropic/*`, adicionar 15s de delay entre cada teste. Se for `google/*`, sem delay.

## Alteração única: `src/pages/AdminTests.tsx`

1. No início de `runTests()`, fazer query ao banco para buscar o modelo ativo:
   ```ts
   const { data } = await supabase.from('system_config').select('value').eq('key', 'ai_model').single();
   const model = data?.value || 'google/gemini-2.5-pro';
   const isAnthropic = typeof model === 'string' && model.startsWith('anthropic/');
   ```

2. Após cada chamada de teste (depois do `setResults`), adicionar delay condicional:
   ```ts
   if (isAnthropic && i < TEST_QUEUE.length - 1) {
     await new Promise(r => setTimeout(r, 15000));
   }
   ```

3. Atualizar o texto de progresso para indicar o delay quando ativo:
   - Mostrar "⏳ Aguardando rate limit (15s)..." durante o delay

