

## Correção: Deduplicar recuperação de checkout por telefone

### Problema

Quando um cliente cria múltiplas sessões de checkout (double-click, refresh, volta depois), cada sessão gera uma entrada separada na tabela `checkout_sessions`. A função `recover-abandoned-checkout` busca todas com `recovery_sent = false` e envia uma mensagem para cada uma — resultado: o cliente recebe 2, 3, ou até 6 mensagens iguais de recuperação.

### Correção

**Arquivo: `supabase/functions/recover-abandoned-checkout/index.ts`**

Após buscar as sessões abandonadas (linha 59-66), agrupar por telefone e processar apenas a sessão **mais recente** de cada número. As demais sessões do mesmo telefone são marcadas como `recovery_sent = true` sem enviar mensagem (status "skipped_duplicate").

Lógica:
1. Buscar sessões abandonadas (como já faz)
2. Agrupar por `phone` — manter apenas a mais recente de cada telefone
3. Marcar as duplicatas como `recovery_sent = true` com `recovery_last_error = 'Duplicate - grouped by phone'`
4. Processar normalmente apenas 1 sessão por telefone

**Escopo**: ~15 linhas alteradas em 1 arquivo. Sem migration.

