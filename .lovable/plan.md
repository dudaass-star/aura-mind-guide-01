

# Correção: 11 Perfis Marcados Prematuramente como `trial_expired`

## Diagnóstico

A migração `20260323193825` (23 de março) executou:
```sql
UPDATE profiles SET status = 'trial_expired' WHERE status = 'trial';
```

Isso mudou **todos** os perfis com `status = 'trial'` para `trial_expired` — incluindo 11 usuários que tinham acabado de cadastrar cartão e estavam dentro dos 7 dias de trial. Não existe nenhuma função periódica fazendo isso; foi um update manual que atingiu todo mundo.

**Consequência**: Quando o Stripe cobrar esses usuários ao final do trial, o webhook `invoice.paid` vai procurar o perfil pelo phone e atualizar para `active` — isso ainda vai funcionar. Porém, enquanto estão como `trial_expired`, eles estão sendo **bloqueados** no `process-webhook-message` (recebem mensagem de "trial expirado" em vez de conversar com a Aura).

Os 2 com `past_due` no Stripe provavelmente foram bloqueados por esse motivo também.

## Plano

### 1. Corrigir os 11 perfis via SQL (insert tool, não migração)
Restaurar para `status = 'trial'` os perfis que:
- Têm `status = 'trial_expired'`
- Têm `trial_started_at` nos últimos 7 dias (trial ainda válido)

```sql
UPDATE profiles 
SET status = 'trial', updated_at = now()
WHERE status = 'trial_expired' 
  AND trial_started_at IS NOT NULL 
  AND trial_started_at > now() - interval '7 days';
```

### 2. Adicionar lógica automática de expiração no `process-webhook-message`
Em vez de depender de migrações manuais, verificar **no momento da mensagem** se o trial expirou:

- Se `status = 'trial'` e `trial_started_at + 7 dias < now()`:
  - Atualizar status para `trial_expired` naquele momento
  - Enviar mensagem de bloqueio

Isso garante que trials expiram naturalmente sem precisar de migrações ou cron jobs.

### 3. Manter `process-webhook-message` compatível
A salvaguarda existente (`isLegitTrial`) já permite que perfis `trial_expired` com `plan` definido continuem conversando. Mas como novos trials via Stripe sempre têm `plan = 'essencial'` (default), **todos** seriam considerados "legítimos". Precisamos ajustar:

- `isLegitTrial` deve verificar `trial_started_at IS NOT NULL` em vez de apenas `plan IS NOT NULL`
- Ou melhor: a expiração inline (passo 2) elimina a ambiguidade — o perfil é verificado e expirado no momento certo

### 4. Não criar mais migrações de UPDATE em massa no status
A migração que causou o problema foi um atalho. A expiração inline resolve o caso de forma sustentável.

## Resultado esperado
- 11 trials ativos restaurados imediatamente — param de ser bloqueados
- Trials passam a expirar automaticamente quando o usuário manda mensagem após 7 dias
- Webhook `invoice.paid` funciona normalmente quando Stripe cobrar ao final do trial
- Sem dependência de cron jobs ou migrações manuais para gerenciar expiração

## Detalhes técnicos
- SQL de correção via insert tool (dados, não schema)
- Arquivo: `supabase/functions/process-webhook-message/index.ts` — adicionar verificação inline de expiração de trial
- Linhas 285-315: ajustar bloco de subscription status check

