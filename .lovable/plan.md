## Objetivo

Trazer as conversas do número de Recuperação para dentro do painel `/admin/mensagens`, em uma nova aba lado a lado com as conversas do número oficial da Aura — em vez de viver numa página separada (`/admin/whatsapp-inbox`).

## Mudanças

### 1. Extrair o inbox de Recuperação em um componente reutilizável

Novo arquivo: `src/components/admin/RecoveryInbox.tsx`

- Recebe todo o miolo atual de `AdminWhatsappRecovery.tsx` (lista de `recovery_conversations`, painel de conversa, realtime, envio via `whatsapp-recovery-admin-reply`, badge de janela 24h, contexto de checkout).
- Remove o `<header>`, o `<Tabs>` interno e o wrapper `min-h-screen` — fica só o grid `[320px_1fr]` para encaixar dentro de outro layout.
- Sem mudança de lógica nem de estilo dos cards/bolhas.

### 2. Adicionar abas no painel oficial

Editar: `src/pages/AdminMessages.tsx`

- Envolver o conteúdo principal (abaixo do header existente) em `<Tabs defaultValue="oficial">` com duas abas:
  - **Aura (oficial)** → todo o conteúdo atual (lista + conversa).
  - **Recuperação** → renderiza `<RecoveryInbox />`.
- A `TabsList` fica logo abaixo do header, alinhada à esquerda. Mantém o título "Mensagens" + ícone atuais.
- Badge de contagem na aba "Recuperação" mostrando total de conversas não lidas (opcional, busca leve por `recovery_conversations` com `last_inbound_at > last_admin_read_at`).

### 3. Simplificar a página antiga

Editar: `src/pages/AdminWhatsappRecovery.tsx`

- Vira um wrapper fino que reusa `<RecoveryInbox />` com o header próprio, para não quebrar links existentes (`/admin/whatsapp-inbox` continua funcionando).
- Remove a aba "Número Oficial" interna (redundante agora).

### 4. Atalho visual

- O botão/atalho de "Recovery" que já existe no `AdminEngagement` permanece, mas ele pode opcionalmente abrir direto na aba certa via query param `?tab=recuperacao` em `/admin/mensagens` (read em `useSearchParams` no AdminMessages para setar a `defaultValue` da Tab).

## Detalhes técnicos

- Nenhuma alteração em RLS, edge functions ou tabelas — `recovery_conversations` / `recovery_messages` já são lidas pelo client com policies admin.
- Realtime e marcação de leitura (`last_admin_read_at`) continuam dentro do `RecoveryInbox` — funcionam igual nas duas páginas que o renderizam.
- Mobile: a aba ativa ocupa toda a largura; cada inbox já tem seu próprio comportamento responsivo, então não há conflito.

```text
/admin/mensagens
├── Header (Mensagens)
└── Tabs
    ├── Aura (oficial)  ← lista + conversa atual
    └── Recuperação     ← <RecoveryInbox />
```
