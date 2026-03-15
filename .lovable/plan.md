

## Plano: Painel de Mensagens (estilo WhatsApp) no Admin

### Objetivo
Criar uma nova página `/admin/mensagens` com interface split-panel: lista de usuários à esquerda, conversa do usuário selecionado à direita (estilo WhatsApp).

### Arquitetura

**Nova página:** `src/pages/AdminMessages.tsx`

- **Painel esquerdo:** Lista de usuários (da tabela `profiles`) com nome, telefone, status, e preview da última mensagem. Campo de busca por nome/telefone no topo.
- **Painel direito:** Histórico de mensagens do usuário selecionado (tabela `messages`), ordenado cronologicamente, com bolhas estilo chat (user = direita, assistant = esquerda). Scroll automático para baixo.

**Backend:** Nova edge function `admin-messages` que:
1. `GET /list` — Retorna usuários com última mensagem e contagem, ordenados por atividade recente. Valida admin via `has_role`.
2. `GET /conversation?user_id=xxx` — Retorna todas as mensagens de um usuário específico, ordenadas por `created_at`.

Ambas usam `service_role` para bypass de RLS (mensagens são protegidas por RLS e admin não é o `user_id` delas).

**Rota:** Adicionar `/admin/mensagens` no `App.tsx`.

### UI

```text
┌──────────────────┬────────────────────────────┐
│  🔍 Buscar...    │  Nome do Usuário    status │
│──────────────────│────────────────────────────│
│ ● Adriana    9/10│                            │
│   "me sinto..."  │    ┌──────────────┐        │
│ ● Patrícia   9/10│    │ msg usuário  │        │
│   "preciso pa.." │    └──────────────┘        │
│ ● Moises    10/10│  ┌──────────────┐          │
│   "obrigado..."  │  │ msg aura     │          │
│                  │  └──────────────┘          │
│                  │    ┌──────────────┐        │
│                  │    │ msg usuário  │        │
│                  │    └──────────────┘        │
└──────────────────┴────────────────────────────┘
```

### Mudanças

1. **`supabase/functions/admin-messages/index.ts`** — Edge function com 2 ações (list users + get conversation), validação admin via service_role + has_role check.
2. **`src/pages/AdminMessages.tsx`** — Página com layout split, busca, seleção de usuário, visualização de conversa com bolhas estilo chat.
3. **`src/App.tsx`** — Adicionar rota `/admin/mensagens`.
4. **`supabase/config.toml`** — Registrar nova function com `verify_jwt = false`.
5. **Navegação** — Adicionar link para a página a partir do admin existente.

### Detalhes técnicos

- A edge function usa `SUPABASE_SERVICE_ROLE_KEY` para ler mensagens de qualquer usuário, mas valida que o caller é admin verificando o JWT do header Authorization com `has_role`.
- Lista de usuários puxa `profiles` com join em `messages` para pegar última mensagem e contagem.
- Mensagens paginadas (últimas 200 por padrão) com scroll para carregar mais se necessário.
- Mobile: painel esquerdo ocupa tela cheia, ao selecionar usuário mostra conversa com botão voltar.

