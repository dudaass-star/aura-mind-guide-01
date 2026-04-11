

## Plano: Painel de Gestão de Usuários (Admin)

### O que será construído

Uma nova página `/admin/usuarios` com tabela de todos os usuários e capacidade de gerenciar manualmente contas, planos e status.

### Funcionalidades

1. **Tabela de Usuários** — lista todos os profiles com busca por nome/telefone/email
2. **Ações por usuário** (via dialog ao clicar):
   - Alterar plano (essencial/direção/transformação)
   - Alterar status (active/inactive/canceled/paused)
   - Editar nome, email, telefone
   - Ver dados: data de criação, último contato, episódio atual, jornada atual
   - Resetar sessões usadas no mês
3. **Badges visuais** para status (verde=active, amarelo=paused, vermelho=canceled/inactive)

### Alterações técnicas

**Novo arquivo: `src/pages/AdminUsers.tsx`**
- Tabela paginada com busca
- Dialog de edição usando a edge function `admin-update-profile` (já existente)
- Proteção via `useAdminAuth`
- Importa componentes UI existentes (Table, Dialog, Input, Select, Badge, Button)

**Arquivo editado: `src/App.tsx`**
- Adicionar rota `/admin/usuarios` → `AdminUsers`

### Layout da página

```text
[← Voltar]  Gestão de Usuários

[🔍 Buscar por nome, telefone ou email...]

| Nome | Telefone | Plano | Status | Criado em | Último contato | Ações |
|------|----------|-------|--------|-----------|----------------|-------|
| Ana  | +55...   | 🟢 essencial | 🟢 active | 01/04 | 10/04 | [Editar] |

--- Dialog de Edição ---
Nome: [____]
Email: [____]  
Telefone: [____]
Plano: [dropdown]
Status: [dropdown]
[Salvar] [Cancelar]
```

### Sem alterações no backend
A edge function `admin-update-profile` já existe e aceita `{ profile_id, updates }` — será reutilizada.

