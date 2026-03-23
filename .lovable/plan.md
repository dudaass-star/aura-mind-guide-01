

# Fix: Trials legítimos de hoje foram bloqueados pela migração

## Problema

A migração `UPDATE profiles SET status = 'trial_expired' WHERE status = 'trial'` não distinguiu entre trials antigos (sem plano/cartão) e trials novos (via Stripe, com plano). Resultado:

- **Tania Benites** (plano essencial, criada 16:51 hoje) → `trial_expired` ❌
- **Tatiana Santana** (plano direção, criada 00:20 hoje) → `trial_expired` ❌

Ambas pagaram via Stripe e estão com `plan` preenchido. São clientes legítimas bloqueadas por engano.

## Solução

### 1. Corrigir status das duas usuárias (migração SQL)

```sql
UPDATE profiles SET status = 'trial' 
WHERE plan IS NOT NULL 
  AND status = 'trial_expired'
  AND created_at >= '2026-03-23T00:00:00Z';
```

### 2. Corrigir a lógica de bloqueio no `process-webhook-message`

Adicionar verificação: se `status = 'trial_expired'` **E** `plan IS NOT NULL`, tratar como trial válido (não bloquear). Ou melhor: a lógica de expiração futura deve checar `plan IS NULL` antes de expirar.

Alterar o check de bloqueio:
```
// Antes: blockedStatuses = ['trial_expired', ...]
// Depois: só bloquear trial_expired se plan IS NULL
if (profile.status === 'trial_expired' && profile.plan) {
  // Trial legítimo via Stripe — não bloquear, restaurar status
}
```

### 3. Ajustar o funil de conversão no dashboard

Incluir `trial_expired` (sem plano) na query para não perder visibilidade dos trials antigos expirados. Mas o filtro principal `.not('plan', 'is', null)` já garante que só trials via Stripe aparecem no funil.

## Resumo

| Ação | Detalhe |
|------|---------|
| Restaurar Tania e Tatiana | `status = 'trial'` via migração |
| Proteger futuros trials com plano | Check no `process-webhook-message` |
| Dashboard já funciona | Filtro `plan IS NOT NULL` estava correto, problema era o status |

