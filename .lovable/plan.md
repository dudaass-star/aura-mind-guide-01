
Objetivo: corrigir a lógica das métricas para que todas respeitem o período selecionado e para que o funil de Trial & Conversão use somente usuários com cartão quando essa for a definição da etapa.

Diagnóstico confirmado
- O funil atual está errado para o seu caso porque hoje ele é explicitamente all-time no frontend e no backend.
- Ele também usa `trial_started_at` como base, o que inclui 83 perfis de trial, mas só 25 têm cartão (`plan is not null`). Os outros 58 são trials sem cartão.
- O filtro por dia também está desalinhado porque o backend monta o intervalo como UTC (`T00:00:00Z` / `T23:59:59.999Z`), enquanto o uso do produto é local. Para 25/03 isso muda os números.
- “Mensagens no período” hoje conta todas as mensagens, inclusive assistant, enquanto “usuários ativos” considera só `role = 'user'`. As métricas não usam a mesma população.
- Métricas de sessão estão filtrando por `created_at`, não pelo momento real da sessão (`started_at` / `ended_at`), então também podem ficar erradas no período.
- “Convertidos no período” ainda não é uma métrica confiável, porque o sistema não guarda um timestamp real de conversão/pagamento.

Plano de correção
1. Padronizar o período no backend
- Centralizar a construção do intervalo do filtro.
- Interpretar datas do painel em timezone local do produto (America/Sao_Paulo), não em UTC bruto.
- Aplicar exatamente o mesmo intervalo a todas as métricas filtradas por período.

2. Revisar métrica por métrica e corrigir a fonte de dados
- Usuários ativos no período: continuar por mensagens do usuário, mas com o período local correto.
- Mensagens no período: contar apenas mensagens do usuário, ou separar usuário/assistant se quisermos manter as duas visões.
- Sessões completadas: contar por `ended_at` no período.
- Tempo médio de sessão: calcular com sessões concluídas no período real.
- Mensagens por sessão: manter o recorte entre `started_at` e `ended_at`, mas usando apenas sessões concluídas no período.
- Custos: manter por `token_usage_logs.created_at`, corrigindo timezone.
- Cancelamentos: manter por `cancellation_feedback.created_at`, corrigindo timezone.

3. Corrigir Trial & Conversão
- Trocar o funil principal para “no período”, usando somente perfis com:
  - `trial_started_at is not null`
  - `plan is not null`
- Etapas do funil:
  - Entraram com cartão no período
  - Responderam no período / ou responderam dentro da base filtrada
  - Converteram
- Se for útil, manter um bloco separado “all-time”, mas claramente separado e nunca no lugar do funil filtrado.

4. Corrigir a definição de conversão
- Ajuste imediato: restringir o funil aos usuários com cartão para parar de misturar trials sem cartão.
- Ajuste definitivo: adicionar um campo como `converted_at` e/ou `subscription_status` em `profiles`, atualizado pelo webhook.
- Isso permite calcular “convertidos no período” com precisão, em vez de inferir por `status = 'active'`.

5. Atualizar a UI do painel
- Remover a ambiguidade entre “all-time” e “no período”.
- Ajustar títulos/subtítulos para refletir a regra real de cada card.
- Mostrar no texto do funil quando ele estiver filtrado por período e quando estiver usando somente usuários com cartão.

Validação esperada após a correção
- No filtro de 25/03, o funil não deve mais mostrar 83.
- Ele deve refletir apenas os usuários com cartão dentro do dia filtrado.
- As métricas de mensagens, sessões, custo e cancelamento devem variar corretamente ao trocar 7d / 14d / 30d / 90d / dia único.
- O painel deixa de misturar usuários de trial sem cartão com usuários pagos/trial com checkout iniciado.

Detalhes técnicos
- Arquivos principais:
  - `supabase/functions/admin-engagement-metrics/index.ts`
  - `src/pages/AdminEngagement.tsx`
  - `supabase/functions/stripe-webhook/index.ts` (para correção definitiva de conversão)
- Mudanças de backend:
  - refatorar as queries para usar um helper único de período local
  - alinhar filtros por tipo de mensagem e timestamp correto
  - separar métricas “period” de métricas “all-time”
- Mudanças de dados:
  - recomendada migração para `converted_at` e/ou `subscription_status`
- Resultado prático:
  - métricas consistentes entre si
  - filtro de período funcionando de verdade
  - funil usando só a base correta de usuários com cartão
