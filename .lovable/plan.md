

## Auditoria de Proatividade da AURA — Bugs Encontrados

### Resumo

Auditei todas as 16 funções que usam `sendProactive()`. A assinatura é:
```
sendProactive(phone, text, templateCategory = 'checkin', userId?, config?, teaser?)
```

Quando `templateCategory` ou `userId` não são passados, o sistema usa o template **checkin** como fallback e **não consegue verificar a janela de 24h** (precisa do userId). Isso significa que fora da janela, a mensagem vai com o template errado.

### Templates disponíveis vs. uso atual

| Template (category) | Funções que DEVERIAM usar | Status |
|---|---|---|
| `session_reminder` | session-reminder | ✅ Corrigido (4 de 11 chamadas) |
| `checkin` | scheduled-checkin | ✅ OK (default correto) |
| `followup` | conversation-followup, scheduled-followup | ❌ Ambos usam default `checkin` |
| `insight` | pattern-analysis | ❌ Usa default `checkin` |
| `weekly_report` | weekly-report | ❌ Usa default `checkin` |
| `reconnect` | instance-reconnect-notify | ❌ Usa default `checkin` |
| `reactivation` | reactivation-blast, reactivation-check | ❌ Ambos usam default `checkin` |
| `checkout_recovery` | recover-abandoned-checkout | ❌ Usa default `checkin` |
| `content` | periodic-content | ✅ OK (já passa `'content'`) |

### Bugs específicos encontrados

#### Bug 1: session-reminder — 7 chamadas ainda sem template
As 4 chamadas dos lembretes (24h, 1h, 15m, hora exata) foram corrigidas. Mas restam **7 chamadas** sem `templateCategory`:
- **Linha 540**: Lembrete de 10 minutos (sessão esperando confirmação)
- **Linha 604**: Mensagem de sessão perdida (no_show)
- **Linha 730**: Mensagem de fechamento de sessão abandonada
- **Linha 825**: Resumo pós-sessão
- **Linha 840**: Pedido de rating pós-sessão

#### Bug 2: conversation-followup (linha 585)
Usa `sendProactive(profile.phone, message)` sem template nem userId. Deveria usar `'followup'`.

#### Bug 3: scheduled-followup (linha 118)
Usa `sendProactive(cleanPhone, message)` sem template nem userId. Deveria usar `'followup'`.

#### Bug 4: pattern-analysis (linha 376)
Usa `sendProactive(cleanPhone, analysis.whatsapp_message)` sem template nem userId. Deveria usar `'insight'`.

#### Bug 5: weekly-report (linha 401)
Usa `sendProactive(cleanPhone, report)` sem template nem userId. Deveria usar `'weekly_report'`.

#### Bug 6: instance-reconnect-notify (linha 79)
Usa `sendProactive(cleanPhone, message)` sem template nem userId. Deveria usar `'reconnect'`.

#### Bug 7: reactivation-blast (linha 81)
Usa `sendProactive(cleanPhone, message)` sem template nem userId. Deveria usar `'reactivation'`.

#### Bug 8: reactivation-check (linhas 115, 206)
Duas chamadas sem template nem userId. A de trial nudge não tem template específico (poderia ser `'checkin'` que já é o default). A de sessão perdida deveria ser `'reactivation'`.

#### Bug 9: recover-abandoned-checkout (linha 160)
Usa `sendProactive(normalizedPhone, message)` sem template. Deveria usar `'checkout_recovery'`. Nota: não tem `userId` disponível (é pré-cadastro).

#### Bug 10: schedule-setup-reminder (linhas 131, 203)
Duas chamadas sem template nem userId. Não existe template específico para "schedule setup" — poderia usar `'checkin'` (default atual) ou criar um novo.

#### Bug 11: aura-agent ReferenceError
Nos logs, o `aura-agent` está crashando com `ReferenceError: recentUser is not defined` na linha 1075 (`evaluateTherapeuticPhase`). Isso causa HTTP 500 e o fallback "Desculpa, tive um probleminha aqui". **Este é um bug ativo afetando usuários agora.**

### Plano de Correção

#### Prioridade 1 — Bug crítico do aura-agent (Bug 11)
Corrigir a referência `recentUser` no `evaluateTherapeuticPhase` do `aura-agent/index.ts`. Isso está quebrando respostas em produção.

#### Prioridade 2 — Corrigir templates em todas as funções proativas

| Arquivo | Linha(s) | Correção |
|---|---|---|
| `session-reminder/index.ts` | 540 | `sendProactive(cleanPhone, reminderMessage, 'session_reminder', session.user_id)` |
| `session-reminder/index.ts` | 604 | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |
| `session-reminder/index.ts` | 730 | `sendProactive(cleanPhone, messageToSend, 'session_reminder', session.user_id)` |
| `session-reminder/index.ts` | 825 | `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)` |
| `session-reminder/index.ts` | 840 | `sendProactive(cleanPhone, ratingMessage, 'session_reminder', session.user_id)` |
| `conversation-followup/index.ts` | 585 | `sendProactive(profile.phone, message, 'followup', followup.user_id)` |
| `scheduled-followup/index.ts` | 118 | `sendProactive(cleanPhone, message, 'followup', profile.user_id)` |
| `pattern-analysis/index.ts` | 376 | `sendProactive(cleanPhone, analysis.whatsapp_message, 'insight', user.user_id)` |
| `weekly-report/index.ts` | 401 | `sendProactive(cleanPhone, report, 'weekly_report', profile.user_id)` |
| `instance-reconnect-notify/index.ts` | 79 | `sendProactive(cleanPhone, message, 'reconnect', user.user_id)` |
| `reactivation-blast/index.ts` | 81 | `sendProactive(cleanPhone, message, 'reactivation', user.user_id)` |
| `reactivation-check/index.ts` | 115 | `sendProactive(cleanPhone, nudgeMessage, 'reactivation', tp.user_id)` |
| `reactivation-check/index.ts` | 206 | `sendProactive(cleanPhone, message, 'reactivation', session.user_id)` |
| `recover-abandoned-checkout/index.ts` | 160 | `sendProactive(normalizedPhone, message, 'checkout_recovery')` |
| `schedule-setup-reminder/index.ts` | 131, 203 | Manter default `'checkin'` (sem template específico) mas passar userId |

### Impacto
- **Sem a correção**: todas essas funções enviam mensagens com o template `checkin` quando fora da janela de 24h, o que confunde o usuário (prefixo "Seu check-in 🌿" em mensagens que não são check-in)
- **Com a correção**: cada tipo de mensagem usa o template correto com prefixo adequado
- O bug do aura-agent está causando falhas de resposta em tempo real para usuários ativos

