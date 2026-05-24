## Novos SIDs aprovados
- `copy_of_aura_recuperacao` → **HX988544a4c9dd6f79db19dc1427331f02** (15min)
- `copy_of_aura_recuperacao_24hs` → **HX8d40a27b45761678a88c53ec9aa58b32** (24h)

## Passos

### 1. Trocar SIDs nos 3 arquivos
- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts` (cron de produção — `TEMPLATE_15MIN` e `TEMPLATE_24H`)
- `supabase/functions/test-whatsapp-recovery/index.ts` (endpoint de teste)
- `supabase/functions/test-recovery-template/index.ts` (fallback default)

### 2. Deploy das 3 edge functions

### 3. Testar entrega real
- Disparar `test-whatsapp-recovery` para `+51981519708` com `stage=15min` e depois `stage=24h`
- Confirmar via `test-whatsapp-recovery-status` que o status final é `delivered` (sem 63027)

### 4. Reabilitar entregas que falharam com 63027
Migration única para resetar timestamps de checkouts pós-cutoff que travaram com erro 63027, fazendo o cron re-disparar no próximo ciclo:
```sql
UPDATE abandoned_checkouts
SET whatsapp_recovery_15min_sent_at = NULL
WHERE whatsapp_recovery_last_error LIKE '%63027%'
  AND whatsapp_recovery_15min_sent_at IS NOT NULL;

UPDATE abandoned_checkouts
SET whatsapp_recovery_24h_sent_at = NULL
WHERE whatsapp_recovery_last_error LIKE '%63027%'
  AND whatsapp_recovery_24h_sent_at IS NOT NULL;
```
(ajustar nome real da coluna/tabela conforme o schema antes de rodar)

### 5. Confirmar no próximo ciclo do cron
Olhar logs de `recover-abandoned-checkout-whatsapp` após a próxima execução para garantir que os reenvios saem com `delivered` e não com 63027.

## Arquivos afetados
- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`
- `supabase/functions/test-whatsapp-recovery/index.ts`
- `supabase/functions/test-recovery-template/index.ts`
- 1 migration para resetar tentativas falhas
