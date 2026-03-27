

## Corrigir `converted_at` no stripe-webhook

### Problema

O `converted_at` só é preenchido quando o perfil tem `status === 'trial'`. Usuários que estavam com `trial_expired` (trial vencido, pagamento pendente) e depois pagam **não recebem** `converted_at` porque a condição os exclui.

Há 3 pontos no código que precisam ser corrigidos:

### Correções

**Arquivo**: `supabase/functions/stripe-webhook/index.ts`

1. **`checkout.session.completed`** (linha 209)
   - Atual: `const isConverting = !isTrial && (existingProfile.status === 'trial');`
   - Corrigir para: `const isConverting = !isTrial && ['trial', 'trial_expired'].includes(existingProfile.status);`

2. **`invoice.paid`** (linha 525)
   - Atual: `if (profile && profile.status === 'trial' && profile.trial_started_at)`
   - Corrigir para: `if (profile && ['trial', 'trial_expired'].includes(profile.status) && profile.trial_started_at)`
   - Isso garante que usuários com trial expirado que pagam recebam `converted_at` e status `active`

3. **`customer.subscription.updated`** (linha 734) — já cobre `trialing → active`, mas adicionar mesma lógica:
   - Atual: `if (profile && profile.status === 'trial')`
   - Corrigir para: `if (profile && ['trial', 'trial_expired'].includes(profile.status))`

### Resultado

Qualquer pagamento bem-sucedido de um usuário que estava em trial (ativo ou expirado) agora preenche `converted_at`, muda status para `active`, limpa `payment_failed_at`, e cancela tasks de trial pendentes.

