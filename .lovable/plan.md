

# Plano: Painel de Métricas de Engajamento no Admin

## Objetivo

Criar uma nova página `/admin/engajamento` com relatório de métricas de engajamento dos usuários, consultando dados diretamente das tabelas existentes (`messages`, `sessions`, `profiles`).

## Métricas a exibir

1. **Mensagens por sessão** — total de mensagens / total de sessões completadas
2. **Tempo médio de sessão** — média de `ended_at - started_at` das sessões completadas
3. **Taxa de retorno** — % de usuários ativos que enviaram mensagem nos últimos 7 dias vs total de ativos
4. **Usuários ativos** — total com `status = 'active'`
5. **Mensagens na semana** — total de mensagens dos últimos 7 dias
6. **Sessões completadas na semana** — sessões com `status = 'completed'` nos últimos 7 dias

## Implementação

### 1. Nova página `src/pages/AdminEngagement.tsx`
- Usa `useAdminAuth` para proteger acesso (mesmo padrão das outras páginas admin)
- Consulta dados via edge function (service role necessário para ler dados de todos os usuários)
- Cards com as 6 métricas acima
- Navegação de volta ao admin com botão `ArrowLeft`

### 2. Nova edge function `supabase/functions/admin-engagement-metrics/index.ts`
- Recebe request autenticada, valida role admin via `has_role`
- Queries usando service role:
  - `profiles` com `status = 'active'` para contar usuários ativos
  - `messages` com filtro de 7 dias para mensagens recentes
  - `sessions` com `status = 'completed'` para métricas de sessão (calcula duração média)
  - `messages` com filtro de 7 dias + distinct user_id para taxa de retorno
- Retorna JSON com todas as métricas calculadas

### 3. Registrar no `supabase/config.toml`
- `[functions.admin-engagement-metrics]` com `verify_jwt = false` (validação no código)

### 4. Registrar rota no `App.tsx`
- `/admin/engajamento` → `AdminEngagement`

### 5. Adicionar link de navegação
- Botão nas outras páginas admin ou link direto

## Arquivos afetados
- `src/pages/AdminEngagement.tsx` (novo)
- `supabase/functions/admin-engagement-metrics/index.ts` (novo)
- `supabase/config.toml` (adicionar entry)
- `src/App.tsx` (adicionar rota)

