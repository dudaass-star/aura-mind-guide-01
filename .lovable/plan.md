

# Análise do TEMPLATE_MAP atual vs. realidade

## Problemas encontrados

### 1. Templates que NÃO deveriam existir (remover)

| Template atual | Por quê remover |
|---|---|
| `followup` | `conversation-followup` acontece dentro da janela 24h — texto livre, sem custo |
| `generic` | Sem uso real — qualquer envio tem uma categoria específica |

### 2. Template que FALTA

| Template faltando | Função que usa | Tipo |
|---|---|---|
| `checkout_recovery` | `recover-abandoned-checkout` | **Marketing** |

O `checkout_recovery` foi listado como "remover" na conversa anterior, mas ele é necessário. A função `recover-abandoned-checkout` envia mensagem para quem **abandonou o checkout** — esse usuário nunca conversou com a Aura, então está **fora da janela de 24h**. Precisa de template.

### 3. Por que `reactivation` e `checkout_recovery` são Marketing?

A Meta classifica templates em duas categorias:

- **Utility**: mensagens relacionadas a uma **transação ou serviço ativo** do usuário (ex: lembrete de sessão, relatório semanal, conteúdo da jornada que ele assina)
- **Marketing**: mensagens para **reconquistar, vender ou promover** — enviadas a quem não tem relação ativa ou para estimular ação comercial

| Template | Por que é Marketing |
|---|---|
| `reactivation` | Tenta trazer de volta um usuário **inativo/cancelado** — promoção, não serviço |
| `checkout_recovery` | Tenta converter alguém que **abandonou compra** — venda direta |

Se esses dois fossem classificados como Utility, a Meta **rejeitaria** os templates na revisão. É regra da plataforma.

**Custo da diferença**: Utility ~R$ 0.05/msg vs Marketing ~R$ 0.35/msg (Brasil 2026).

## TEMPLATE_MAP correto (7 templates)

| Categoria | Template | Prefixo | Meta | Função |
|---|---|---|---|---|
| `checkin` | `aura_checkin` | `Seu check-in 🌿\n\n` | Utility | `scheduled-checkin` (7 dias inativo) |
| `content` | `aura_content` | `Conteúdo da jornada 🌱\n\n` | Utility | `periodic-content` (Ter/Sex) |
| `weekly_report` | `aura_weekly_report` | `Seu resumo semanal 📊\n\n` | Utility | `weekly-report` (Dom 19h) |
| `insight` | `aura_insight` | `Insight da Aura ✨\n\n` | Utility | `pattern-analysis` (Qui/Sáb) |
| `session_reminder` | `aura_session_reminder` | `Lembrete de sessão 🕐\n\n` | Utility | `session-reminder` |
| `reactivation` | `aura_reactivation` | `Oi, sentimos sua falta 💜\n\n` | Marketing | `reactivation-check`, `reactivation-blast` |
| `checkout_recovery` | `aura_checkout_recovery` | `Seu acesso está esperando ✨\n\n` | Marketing | `recover-abandoned-checkout` |

## O que NÃO precisa de template (janela 24h)

| Função | Motivo |
|---|---|
| `conversation-followup` | Reage a conversa recente (dentro da janela) |
| `send-meditation` | Usuário pede → reativo (dentro da janela) |
| `aura-agent` (respostas) | Resposta direta à mensagem do usuário |
| `deliver-time-capsule` | Agendada pelo usuário em conversa ativa |
| `scheduled-followup` (commitments) | Follow-up de compromissos recentes |

## Alteração necessária no código

Atualizar `whatsapp-official.ts`:
- Remover `followup` e `generic` do `TemplateCategory` e `TEMPLATE_MAP`
- Manter `checkout_recovery` (estava marcado para remover, mas é necessário)
- Total: 7 templates (5 utility + 2 marketing)

## Simulação de custo corrigida (por usuário/mês)

| Tipo | Freq/mês | Meta | Custo |
|---|---|---|---|
| Jornada (1º template) | ~8 | Utility | R$ 0.40 |
| Relatório semanal | ~4 | Utility | R$ 0.20 |
| Insight proativo | ~8 | Utility | R$ 0.40 |
| Lembrete de sessão | ~4 | Utility | R$ 0.20 |
| Check-in 7 dias | ~1 | Utility | R$ 0.05 |
| **Subtotal Utility** | ~25 | | **R$ 1.25** |
| Reativação | ~0-1 | Marketing | R$ 0.35 |
| Checkout recovery | ~0-1 | Marketing | R$ 0.35 |
| **Total Meta** | ~27 | | **~R$ 1.95** |
| Twilio markup | 27 × $0.005 | | ~R$ 0.78 |
| **Total/usuário/mês** | | | **~R$ 2.73** |

