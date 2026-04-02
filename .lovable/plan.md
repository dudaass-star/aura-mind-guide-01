

## Verificação Completa — Mensagens Proativas da AURA

### Status Geral: 18 funções auditadas, 2 bugs ativos

---

### Tabela de Conformidade — sendProactive()

Todas as funções que usam `sendProactive()` estão corretas com template e userId:

| Função | Template | userId | Status |
|--------|----------|--------|--------|
| `session-reminder` (11 chamadas) | `session_reminder` | ✅ | ✅ OK |
| `conversation-followup` | `followup` | ✅ | ✅ OK |
| `scheduled-followup` | `followup` | ✅ | ✅ OK |
| `pattern-analysis` | `insight` | ✅ | ✅ OK |
| `weekly-report` | `weekly_report` | ✅ | ✅ OK |
| `instance-reconnect-notify` | `reconnect` | ✅ | ✅ OK |
| `reactivation-blast` | `reactivation` | ✅ | ✅ OK |
| `reactivation-check` (2 chamadas) | `reactivation` | ✅ | ✅ OK |
| `recover-abandoned-checkout` | `checkout_recovery` | ❌ (esperado) | ⚠️ Bug 21656 |
| `schedule-setup-reminder` (2 chamadas) | `checkin` | ✅ | ✅ OK |
| `scheduled-checkin` | `checkin` | ✅ | ✅ OK |
| `monthly-schedule-renewal` | `checkin` | ✅ | ✅ OK |
| `periodic-content` | `content` | ✅ | ✅ OK |
| `start-trial` | `welcome_trial` | ✅ | ✅ OK |
| `admin-send-message` | dinâmico | ✅ | ✅ OK |
| `test-episode-send` | `content` | ✅ | ✅ OK |
| `deliver-time-capsule` (3 chamadas) | `checkin` | ✅ | ✅ OK |
| `send-meditation` (3 chamadas) | `content` | ✅ | ✅ OK |

Todos os usos de `sendMessage()` estão em contextos corretos:
- `process-webhook-message`: respostas reativas (dentro da janela de 24h) ✅
- `send-zapi-message`: envio manual de admin ✅

---

### Bug 1 (ATIVO): Erro 21656 no `checkout_recovery`

**Evidência no banco** (últimas 3 dias):
- 01/04 23:40 — `failed` com erro 21656
- 01/04 11:00 — `failed` com erro 21656

**Causa**: O `recover-abandoned-checkout` envia **3 variáveis** (`name`, `planLabel`, `checkoutLink`) como `{"1": "nome", "2": "Plano Essencial", "3": "https://..."}`. Mas o template `aura_checkout_recovery` no Twilio Content segue o mesmo padrão dos demais templates — **uma única variável** `{{1}}`. O Twilio rejeita porque recebe 3 variáveis onde espera 1.

**Correção**: Reverter para o padrão de variável única. Em vez de 3 variáveis estruturadas, enviar o texto completo da mensagem como uma única variável (como todos os outros templates fazem). Remover o parâmetro `templateVariables` da chamada em `recover-abandoned-checkout`.

```typescript
// ANTES (quebrado):
const result = await sendProactive(normalizedPhone, message, 'checkout_recovery', undefined, undefined, undefined, [name, planLabel, checkoutLink]);

// DEPOIS (correto):
const result = await sendProactive(normalizedPhone, message, 'checkout_recovery');
```

---

### Bug 2 (MENOR): `execute-scheduled-tasks` usa `sendMessage` para lembretes e mensagens agendadas

**Linhas 119 e 148**: As tarefas do tipo `reminder` e `message` usam `sendMessage()` em vez de `sendProactive()`. Estas são mensagens proativas (iniciadas pelo sistema, não em resposta ao usuário), então fora da janela de 24h serão bloqueadas pela Meta.

**Correção**: Substituir por `sendProactive()` com template `checkin` e `userId`:
```typescript
// reminder (linha 119)
await sendProactive(cleanPhoneNumber(profile.phone), reminderText, 'checkin', task.user_id);

// message (linha 148)
await sendProactive(cleanPhoneNumber(profile.phone), messageText, 'checkin', task.user_id);
```

Isso requer importar `sendProactive` e `cleanPhoneNumber` no `execute-scheduled-tasks`.

---

### Outros Alertas (não são bugs de proatividade)

**Domínio de email não verificado**: O `check-instance-health` está falhando ao enviar alertas por email com erro `"The olaaura.com.br domain is not verified"` no Resend. Isso não afeta mensagens proativas do WhatsApp, mas os alertas de instância desconectada por email não estão chegando.

---

### Templates no Banco

Todos os 13 templates estão `is_active: true` com ContentSid configurados. Nenhum está pendente.

### Impacto das Correções

1. **Bug 1**: Corrige falhas de checkout recovery que estão perdendo conversões desde 01/04
2. **Bug 2**: Garante que lembretes e mensagens agendadas pelo usuário funcionem fora da janela de 24h

