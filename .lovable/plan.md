# Corrigir cron faltante do relatório semanal + reenviar para o Eduardo

## Diagnóstico

Investigação completa:

1. Eduardo (`329ebadd-...`, +5551981519708, plano direção, status active): **nenhuma mensagem de relatório semanal** em `messages` no domingo 26/04.
2. Função `weekly-report`: **zero logs recentes** — não foi invocada.
3. **Causa raiz no `cron.job`**: existe um único agendamento para essa função, mas com schedule errado.
   - `jobname`: `monthly-report`
   - `schedule`: `0 22 1 * *` (apenas dia 1 do mês, 22h UTC)
   - **Não existe cron rodando aos domingos** apontando para `weekly-report`.

A função em si está correta:
- Invoca `sendProactive(phone, teaser, 'weekly_report', userId)`.
- Categoria `weekly_report` mapeada na tabela `whatsapp_templates` para o template **`aura_weekly_report_v2`** (ContentSid `HX607738eeadd6fc8008c5735bbf0457a1`), ativo em pt_BR.
- Janela 24h aberta → teaser direto como texto livre. Janela fechada → template oficial + `pending_insight: [WEEKLY_REPORT]…` entregue pelo fast-path do `process-webhook-message` quando o usuário clica no botão.

Ou seja: lógica de envio e template já estão corretos. Só falta o cron disparar aos domingos.

## Mudanças

### 1. Criar cron semanal de domingo

Inserido via SQL `cron.schedule(...)` (não migration — contém anon key):

- **jobname**: `weekly-report-sunday-10am-brt`
- **schedule**: `0 13 * * 0` (todo domingo 13h UTC = **10h BRT**)
- **target**: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/weekly-report`
- **body**: `{}` (a função calcula `weekStart` sozinha — últimos 7 dias)

Horário 10h BRT: fora das silent hours (22h–08h), domingo de manhã, dá tempo de processar todos os batches antes do almoço. Padrão consistente com os outros crons proativos do projeto.

Mantemos o cron `monthly-report` como está (dia 1 do mês, 22h UTC) — ele continua válido para o relatório mensal.

### 2. Reenvio manual para o Eduardo

Após criar o cron, invocar uma vez via `supabase.functions.invoke('weekly-report', { body: { target_user_id: '329ebadd-07eb-4e1e-88db-d8974b2ea3e5' } })` para que ele receba o relatório que perdeu agora, sem esperar o próximo domingo.

A função já tem suporte a `target_user_id` no parse de body (linha ~310). Se o caminho individual não existir totalmente, ajuste mínimo antes de disparar.

### 3. Memória

Salvar `mem://technical/weekly-report/cron-schedule` com a regra: relatório **semanal** → `0 13 * * 0` (domingo 10h BRT); relatório **mensal** → `0 22 1 * *` (dia 1 às 22h UTC). Evita confusão futura entre as duas cadências.

## Validação

- `SELECT * FROM cron.job WHERE jobname = 'weekly-report-sunday-10am-brt'` confirmando o schedule.
- Logs do `weekly-report` mostrando o batch executado após o disparo manual.
- Última mensagem em `messages` para o Eduardo contendo o teaser do relatório semanal.
