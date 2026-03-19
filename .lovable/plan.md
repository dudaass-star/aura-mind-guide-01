

# Melhorias no Painel de Mensagens Admin

## Mudança Principal: Contador mensal em vez de trial

**Problema**: A linha 322-324 mostra `trial: {user.trial_conversations_count}/50` — irrelevante agora.

**Solução**: Substituir por contagem de mensagens do mês vigente. No edge function `admin-messages`, calcular `month_message_count` filtrando mensagens com `created_at >= primeiro dia do mês`. No frontend, exibir `"mês: {count} msgs"`.

## Melhorias Adicionais Sugeridas

1. **Filtros rápidos por status** — Chips clicáveis no topo da lista (Todos / Ativos / Trial / Cancelados) para filtrar rapidamente sem usar a busca de texto.

2. **Contagem de mensagens do mês ao invés de total** — O badge `message_count` (linha 314-316) atualmente mostra o total all-time. Mostrar o total do mês é mais útil operacionalmente. Manter o total como tooltip.

3. **Indicador de "não lida"** — Destacar usuários cuja última mensagem é `role: 'user'` (ou seja, a Aura ainda não respondeu ou o admin não viu). Isso ajuda a priorizar quem precisa de atenção.

4. **Scroll automático melhorado** — Atualmente faz scroll ao carregar, mas se o admin está lendo mensagens antigas e uma nova chega, perde a posição. Só auto-scroll se já estiver no fundo.

## Arquivos Alterados

- **`supabase/functions/admin-messages/index.ts`**: Adicionar query `month_message_count` (mensagens do mês) por usuário, remover `trial_conversations_count` do select (ou manter mas não usar).
- **`src/pages/AdminMessages.tsx`**: 
  - Substituir `trial: X/50` por `mês: X msgs`
  - Adicionar filtros por status
  - Destacar usuários com última msg do tipo `user`
  - Badge principal = msgs do mês (tooltip = total)

## Complexidade

Baixa-média. Mudanças concentradas em 2 arquivos. A query mensal é simples (`gte` no primeiro dia do mês).

