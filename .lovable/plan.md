

# Fix: Remover debounce self-abort no `process-webhook-message`

## Problema

Quando o usuário envia 2 mensagens rápidas:
1. Worker 1 pega o lock, persiste msg A, espera o delay
2. Worker 2 vê lock ocupado, persiste msg B no banco, aborta
3. Worker 1 termina o delay → debounce check (linha 688-704) vê que msg B é mais nova → **aborta também**
4. Ninguém responde

A lógica de acumulação (linhas 707-733) já resolve isso — ela junta todas as msgs do usuário desde a última resposta. Mas o debounce impede que o código chegue até ela.

## Correção

**Arquivo:** `supabase/functions/process-webhook-message/index.ts`

Substituir linhas 682-705 por:

```typescript
// ========================================================================
// DEBOUNCE REMOVIDO
// ========================================================================
// O bloco de debounce foi removido porque causava deadlock:
// o Worker 1 (com lock) via a msg do Worker 2 no banco e se auto-abortava,
// enquanto o Worker 2 já tinha abortado por não ter o lock.
// A lógica de acumulação abaixo já resolve o caso de msgs sequenciais —
// ela junta todas as msgs do usuário desde a última resposta da Aura.
// O lock atômico garante que apenas 1 worker processa por vez.
// ========================================================================
```

Nenhuma outra mudança. A acumulação (linhas 707-733) continua funcionando normalmente.

## Deploy

Fazer deploy da function `process-webhook-message` após a alteração.

