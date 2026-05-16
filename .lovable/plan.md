## Decisão

Concordo — não vale criar painel novo. A `AdminUsers.tsx` já tem layout, busca, paginação, RLS admin e o dialog de edição. Adicionamos D0 + rating médio nas colunas/filtros existentes e expomos detalhes no dialog.

## Mudanças (1 arquivo: `src/pages/AdminUsers.tsx`)

### 1. Query enriquecida
Adicionar ao SELECT de `profiles`:
- `pending_first_session_invite`
- `first_session_invite_attempts`
- `needs_schedule_setup`

Segunda query agregada para rating (uma só, em lote, indexada por `user_id` dos perfis da página atual):
```
session_ratings → AVG(rating), COUNT(*) GROUP BY user_id WHERE user_id IN (...)
```
Map `userId → { avg, count }` montado client-side e injetado nas linhas.

### 2. Nova coluna "D0" na tabela
Badge compacto com 3 estados visuais:
- 🟡 **Pendente** (attempts=0, pending=true) — convite ainda não disparado
- 🔵 **Tentando Nx** (attempts≥1, pending=true) — exibe número de tentativas
- 🟢 **Recusado→Setup** (pending=false, needs_schedule_setup=true)
- ⚪ **Concluído** (pending=false, needs_schedule_setup=false)

### 3. Nova coluna "Rating médio"
`⭐ 4.3 (12)` — média + contagem. `—` quando sem ratings.

### 4. Filtro por período (recorte temporal)
Dropdown acima da tabela: **Criado em** → Hoje / 7 dias / 30 dias / Todos. Aplica `created_at >= ...` na query de profiles. Cobre o "por período" do pedido sem virar dashboard separado.

### 5. Filtro rápido por status D0
Dropdown ao lado: **D0** → Todos / Pendentes / Em tentativa / Recusados / Concluídos. Traduz para `.eq()`/`.gt()` nas 3 colunas.

### 6. Dialog de edição — bloco D0
No painel de metadados (linhas 290-296), adicionar:
- D0: `pending=true, attempts=2, setup=false`
- Rating médio: `4.3 ⭐ em 12 sessões`
- Botão **"Rearmar D0"** (só aparece quando `pending=false` e `attempts<3`) → chama `admin-update-profile` setando `pending_first_session_invite=true`, `first_session_invite_attempts=0`, `needs_schedule_setup=false`. Útil para casos como a Fernanda.

## Detalhes técnicos

- **RLS**: `session_ratings` já tem `Service role full access` + `Users can view own ratings`. Admins **não têm** policy de SELECT global ainda → precisa migração adicionando `Admins can read session_ratings` (`has_role(auth.uid(),'admin')`). Mesmo padrão usado em `dunning_attempts`, `failed_message_log` etc.
- **Edge function** `admin-update-profile` já aceita `updates` arbitrário — funciona pro rearm sem alteração.
- **Performance**: a query de rating é feita só para os 20 user_ids da página atual (`.in('user_id', ids)`), não tabela inteira.
- **Sem novas rotas, sem novo menu, sem novo componente de página.**

## Fora de escopo

- Métricas agregadas globais (% D0 pendentes do mês, funil de conversão) — fica para um possível card no `/admin/engajamento` depois, se virar necessidade.
- Histórico de tentativas D0 por usuário (timeline) — hoje só temos o contador, não há tabela de eventos.