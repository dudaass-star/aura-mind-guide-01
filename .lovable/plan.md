

## Plano: Limpeza de customers duplicados no Stripe + prevenção futura

### Problema identificado

100 customers no Stripe para ~35 usuários reais. Causas:
- Checkout abandonado cria customer sem assinatura
- Retry com telefone em formato diferente cria customer duplicado
- Exemplo: `cus_UF0go0thSpa1Iu` tem 3 subscriptions (2 trialing, 1 cancelada)

### Impacto

- A função `reengagement-blast` já deduplica — sem risco de envio duplicado
- Mas clientes com 2+ subscriptions trialing podem ser cobrados em duplicata quando o trial acabar
- "Lixo" dificulta auditoria manual no Stripe

### Solução em 2 partes

#### Parte 1: Edge function de auditoria `audit-stripe-duplicates`

Nova função que:
1. Lista todos os customers do Stripe
2. Agrupa por phone no metadata (normalizado)
3. Identifica duplicatas reais (mesmo phone, múltiplos customers)
4. Identifica customers sem assinatura (órfãos de checkout abandonado)
5. Identifica customers com múltiplas subscriptions ativas/trialing
6. Modo `dry_run` (default) para relatório, modo `fix` para:
   - Cancelar subscriptions duplicadas (manter a mais recente)
   - Deletar customers sem assinatura nem pagamento

#### Parte 2: Prevenção no `create-checkout`

Melhorar a busca de customer existente:
- Além de buscar por `metadata['phone']`, buscar também por **email**
- Se encontrar por email mas phone diferente, atualizar o metadata do phone
- Isso evita criação de novos customers quando a mesma pessoa refaz checkout

### Mudanças

| Componente | Ação |
|---|---|
| `supabase/functions/audit-stripe-duplicates/index.ts` | Nova função de auditoria e limpeza |
| `supabase/functions/create-checkout/index.ts` | Adicionar fallback de busca por email |

### Fluxo da auditoria

```text
1. Lista todos os customers do Stripe (paginado)
2. Normaliza phone de cada um
3. Agrupa por phone normalizado
4. Para cada grupo com >1 customer:
   a. Identifica qual tem subscription ativa (keeper)
   b. Reporta os duplicados
5. Para customers sem phone e sem subscription:
   a. Reporta como órfãos
6. Em modo fix:
   a. Cancela subscriptions extras
   b. Deleta customers órfãos
```

### Prioridade

Antes de rodar o `reengagement-blast` com `dry_run: false`, vale rodar a auditoria para garantir que não existe nenhum customer com 2 trials ativos que seria cobrado em duplicata.

