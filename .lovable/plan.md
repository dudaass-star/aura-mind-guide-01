## Problema

Na tela `/admin/users`, a coluna **Sessões** mostra `0·0·0/0` para todos os usuários, mesmo quando existem sessões reais no banco (ex.: Danúbia tem rating 4.0 capturado, ou seja, existe sessão `completed`, mas a coluna mostra 0 e o rating exibe `(1/–)`).

## Causa raiz

A query `fetchSessionStats` em `src/pages/AdminUsers.tsx` (linha 246) consulta `public.sessions` usando o cliente Supabase autenticado como admin. Mas as RLS policies da tabela `sessions` são:

- `Users can view own sessions` → `auth.uid() = user_id`
- `Service role full access` → service role apenas
- **Nenhuma policy de admin**

Logo, o admin recebe `[]` em vez das sessões dos outros usuários — silenciosamente, sem erro. O mesmo padrão funciona em `session_ratings` justamente porque essa tabela tem `Admins can read session_ratings` (visto na coluna Rating, que aparece). Tabelas como `profiles`, `failed_message_log`, `dunning_attempts` etc. já seguem esse mesmo padrão.

## Solução

Adicionar uma policy de SELECT para admins na tabela `sessions`, espelhando exatamente o padrão já usado em `session_ratings` e `profiles`.

### Migration (única alteração)

```sql
CREATE POLICY "Admins can read all sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

Não muda nada para usuários comuns (continuam vendo só as próprias) nem para edge functions (service role já tem acesso total). É somatório, não substitutivo.

## Verificação

Após aplicar, na tela `/admin/users`:
- A coluna **Sessões** passa a mostrar contagens reais (`feitas·abandono·no-show / agendadas`).
- A coluna **Última sessão** popula com a data relativa.
- O Rating do Danúbia passa de `4.0 (1/–)` para `4.0 (1/1)`.
- O modal de "sessões abandonadas" passa a abrir com dados.

## O que NÃO muda

- Zero alterações em `AdminUsers.tsx` — a lógica de classificação (`completed`/`abandoned`/`no-show`) já está correta, só estava sem dados.
- Zero alterações em edge functions ou fluxos críticos.
- Nenhuma outra policy é afetada.
