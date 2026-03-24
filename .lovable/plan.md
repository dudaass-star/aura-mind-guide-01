

# Análise: Métricas de Cancelamento no Painel de Engajamento

## Resultado: Funcionando, mas com 3 problemas

### O que está correto
- **Pipeline completo**: Usuário cancela → `cancel-subscription` salva feedback em `cancellation_feedback` → `admin-engagement-metrics` consulta e agrupa → frontend exibe na aba "Cancelamentos"
- **4 cards**: Cancelados no Período, Churn Rate, Total Cancelados, Cancelando — todos conectados corretamente
- **Motivos agrupados**: Exibidos com barra de progresso e percentual
- **Filtro de data**: Funciona corretamente para `canceledInPeriod` e `cancellationReasons`

### Problema 1: `user_id` nunca é salvo no feedback
A tabela `cancellation_feedback` tem coluna `user_id`, mas o `cancel-subscription` **nunca passa o `user_id`** no insert. Busca o perfil pelo telefone, mas não inclui o `user_id` no registro de feedback. Isso impossibilita cruzar cancelamentos com dados do perfil no futuro.

**Correção**: No `cancel-subscription`, após encontrar o perfil pelo telefone, incluir `user_id` no insert do `cancellation_feedback`.

### Problema 2: Mapeamento de motivos incompleto no frontend
Os motivos definidos no `cancel-subscription` são:
- `expensive`, `not_using`, `not_satisfied`, `come_back_later`, `other`

Mas o frontend mapeia:
- `not_using`, `too_expensive`, `not_helpful`, `found_alternative`, `technical_issues`, `other`, `unknown`

**Mismatch**: `expensive` ≠ `too_expensive`, `not_satisfied` ≠ `not_helpful`. Motivos reais aparecem como texto cru (ex: "expensive" em vez de "Está caro pra mim").

**Correção**: Atualizar o mapeamento no frontend para corresponder aos IDs reais usados no `cancel-subscription`.

### Problema 3: `canceledInPeriod` conta pausas também
A query filtra `cancellation_feedback` por data, mas **não filtra por `action_taken`**. Pausas (`action_taken: 'paused'`) são contadas junto com cancelamentos reais (`action_taken: 'canceled'`). Isso infla o número de cancelamentos e o churn rate.

**Correção**: Filtrar apenas `action_taken = 'canceled'` para `canceledInPeriod` e `churnRate`. Opcionalmente, mostrar pausas como métrica separada.

### Mudanças

**Arquivo 1**: `supabase/functions/cancel-subscription/index.ts`
- Nos 2 inserts do `cancellation_feedback` (linhas 212 e 260), adicionar `user_id` do perfil encontrado

**Arquivo 2**: `supabase/functions/admin-engagement-metrics/index.ts`
- Na query de `cancelFeedbackInPeriod` (linha 306), adicionar filtro `.eq('action_taken', 'canceled')`
- Adicionar query separada para pausas no período

**Arquivo 3**: `src/pages/AdminEngagement.tsx`
- Corrigir o mapeamento de motivos: `expensive` → "Está caro pra mim", `not_satisfied` → "Não gostei do serviço", `come_back_later` → "Vou voltar depois", `pause_requested` → "Pausa solicitada"
- Adicionar card de "Pausas no Período" (opcional)

### Custo
Zero. Apenas correções de dados e mapeamento.

