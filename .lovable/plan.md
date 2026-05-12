# Plano: Isentar ações pós-sessão da quiet hour

## Princípio

Se a sessão aconteceu em quiet hours, todas as **ações de fechamento da própria sessão** (resumo, rating, mensagem de encerramento) devem ser entregues normalmente. O usuário acabou de interagir — não há risco de incomodar.

A quiet hour continua valendo para tudo que é **proativo não solicitado** (lembretes 24h, jornadas, check-ins, conteúdo).

## Mudanças em `supabase/functions/session-reminder/index.ts`

### 1. Rating pós-sessão (linha 583)

- Remover o bloqueio `isQuietHours ? { data: null }` da query de `completedSessions`.
- Manter a janela de 2h após `ended_at` (já é suficiente — sessão termina e 5 min depois o rating sai, mesmo às 23h).

### 2. Mensagem de fechamento de sessão abandonada (linha 562)

- Remover o `else if (isQuietHours)` que suprime a mensagem de encerramento.
- Sempre enviar — é resposta direta a uma sessão que o usuário iniciou.

### 3. O que **continua bloqueado** por quiet hours

- **Lembrete 24h + confirmação** (linha 87) — mantido. É proativo, não responde a interação ativa.
- Todo o resto do sistema (`periodic-content`, `schedule-setup-reminder`, `scheduled-checkin`, etc.) — não muda.

## Sessões já perdidas

Não recuperar. Foco apenas nas próximas.

## Detalhes técnicos

- Apenas 1 arquivo alterado: `supabase/functions/session-reminder/index.ts`.
- Sem migration, sem schema, sem novas secrets.
- Sem impacto em `aura-agent` (resumo já é enviado imediatamente pelo agent quando a sessão fecha — esta mudança garante apenas o **fallback** e o **rating**).
- Atualizar memória `mem://features/whatsapp/session-reminder-flow` para refletir: "Rating pós-sessão e mensagem de encerramento ignoram quiet hours, pois respondem a interação ativa do usuário."
