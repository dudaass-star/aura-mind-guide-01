

## Plano: Sistema de reconciliação Stripe + correção imediata

### Problema
O webhook do Stripe não processou o checkout da Camila. Não há logs, indicando que o Stripe nunca chamou a edge function. Isso é uma falha silenciosa grave -- o cliente paga mas não recebe o serviço.

### Ações

#### 1. Correção imediata da Camila
- Atualizar o perfil via banco de dados: `status: 'active'`, `plan: 'essencial'`
- Enviar mensagem de boas-vindas pós-assinatura via `admin-send-message`

#### 2. Criar edge function de reconciliação (`reconcile-subscriptions`)
Uma função que pode ser chamada manualmente pelo admin para:
- Listar todas as assinaturas ativas no Stripe
- Comparar com os perfis no banco de dados
- Identificar inconsistências (assinatura ativa no Stripe mas perfil `trial` ou sem plano)
- Corrigir automaticamente os perfis desatualizados
- Enviar mensagem de boas-vindas para quem não recebeu

#### 3. Adicionar botão no painel admin
- Adicionar na página de admin um botão "Reconciliar Assinaturas" que chama a nova função
- Mostrar relatório das inconsistências encontradas e corrigidas

#### 4. Adicionar verificação periódica (opcional)
- Agendar via pg_cron uma verificação diária que cruza assinaturas Stripe com perfis no banco

### Detalhes técnicos

**Nova edge function:** `supabase/functions/reconcile-subscriptions/index.ts`
- Usa `STRIPE_SECRET_KEY` para listar subscriptions ativas
- Para cada subscription, busca o phone nos metadata do customer
- Compara com a tabela `profiles` por phone
- Se perfil existe com status != 'active' ou plan divergente, atualiza
- Retorna relatório JSON com as correções feitas

**Alteração no frontend:** `src/pages/AdminInstances.tsx` ou nova página admin
- Botão para disparar reconciliação manual
- Exibir resultado (quantos perfis corrigidos)

**Config:** Adicionar entry no `supabase/config.toml` para a nova função

