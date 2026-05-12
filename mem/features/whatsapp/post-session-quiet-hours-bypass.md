---
name: Pós-sessão ignora quiet hours
description: Rating, resumo fallback e mensagem de fechamento de sessão são enviados mesmo entre 22h-08h BRT, pois respondem a interação ativa do usuário
type: feature
---

No `session-reminder` edge function, três fluxos **NÃO** respeitam quiet hours (22h-08h BRT):

1. **Rating pós-sessão** (5min após `ended_at`) — query de `completedSessions` roda sempre.
2. **Mensagem de fechamento** de sessão abandonada/expirada — enviada sempre que houver telefone.
3. **Resumo fallback** quando o aura-agent não enviou — segue o mesmo loop do rating.

**Motivo**: a sessão é interação ativa do usuário. Bloquear esses fluxos por quiet hours faz a sessão sair da janela de 2h durante o silêncio noturno → rating perdido permanentemente.

**Continua bloqueado por quiet hours**:
- Lembrete 24h + confirmação de sessão (proativo, não responde a interação).
- Todos os outros fluxos proativos (`periodic-content`, `schedule-setup-reminder`, `scheduled-checkin`, etc.).
