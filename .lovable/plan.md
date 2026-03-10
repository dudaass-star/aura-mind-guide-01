

# Limpeza automática da tabela `stripe_webhook_events`

## Alteração

Adicionar um job `pg_cron` que roda diariamente às 04:00 (horário UTC, ~01:00 BRT) e deleta registros com `processed_at` mais antigo que 30 dias.

## Implementação

**SQL (via insert tool, não migration)** -- contém dados específicos do projeto (URL + anon key):

```sql
SELECT cron.schedule(
  'cleanup-stripe-webhook-events-daily',
  '0 4 * * *',
  $$
  DELETE FROM public.stripe_webhook_events
  WHERE processed_at < now() - interval '30 days';
  $$
);
```

Nenhum arquivo de código precisa ser alterado. Uma única query SQL.

