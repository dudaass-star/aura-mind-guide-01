

## Problema

Após o reset dos registros antigos, o job reenviou mensagens para checkouts que já tinham sido processados antes. A query atual filtra apenas por `recovery_sent = false`, sem verificar se já houve tentativa anterior.

## Solução

Adicionar filtro `recovery_attempts_count = 0` na query de busca de checkouts abandonados em `recover-abandoned-checkout/index.ts`. Isso garante que apenas checkouts que **nunca foram processados** recebam mensagem de recuperação — mesmo que `recovery_sent` seja resetado.

### Arquivo alterado

**`supabase/functions/recover-abandoned-checkout/index.ts`** (linha 62):

Adicionar `.eq('recovery_attempts_count', 0)` logo após `.eq('recovery_sent', false)`.

Resultado: checkouts antigos que já tiveram `recovery_attempts_count` incrementado para 1+ nunca mais serão reprocessados.

