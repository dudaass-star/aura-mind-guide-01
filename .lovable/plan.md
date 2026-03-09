

# Plano: Insights Proativos 2x por semana (Quinta + Sábado)

## Contexto

Hoje o `pattern-analysis` roda apenas nas quintas (11h BRT). O campo `last_proactive_insight_at` já garante no máximo 1 insight a cada 7 dias por usuário, então adicionar sábado cria uma segunda chance para quem foi pulado na quinta, sem risco de duplicidade.

Sábado é estratégico: as pessoas têm mais tempo livre para absorver e agir sobre a sugestão.

## Alterações

### 1. Atualizar cron job no banco
Mudar de `0 14 * * 4` (quinta 11h BRT) para `0 14 * * 4,6` (quinta e sábado 11h BRT).

### 2. Adicionar filtros de proteção no `pattern-analysis/index.ts`
Antes de enviar para cada usuário, verificar:
- **Sessão ativa** (`current_session_id` presente) → skip
- **Aura já mandou mensagem nas últimas 2h** → skip
- **Scheduled task pendente** (retorno já combinado) → skip

### 3. Desativar `scheduled-checkin`
- Remover cron job do banco
- Remover entrada do `config.toml`
- A função pode ser mantida no código mas não será mais invocada

### 4. Atualizar `.lovable/plan.md`
Documentar novo cronograma.

## Resultado

| Dia | Sistema | Função |
|-----|---------|--------|
| Quinta 11h | Insight proativo | `pattern-analysis` |
| Sábado 11h | Insight proativo (2a chance) | `pattern-analysis` |
| ~~Segunda 08h~~ | ~~Check-in semanal~~ | ~~Removido~~ |

Cada usuário recebe no máximo 1 insight por semana. Se recebeu na quinta, não será elegível no sábado. Se foi pulado na quinta (conversa ativa, DND, etc.), terá outra oportunidade no sábado.

