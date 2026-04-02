

## Verificacao Completa — Mensagens Proativas da AURA (Pos-Correcao)

### Status Geral: 18 funcoes auditadas, 1 bug ativo encontrado

---

### Tabela de Conformidade

Todas as 18 funcoes que usam `sendProactive()` foram verificadas no codigo atual:

| Funcao | Template | userId | Status |
|--------|----------|--------|--------|
| `session-reminder` (11 chamadas) | `session_reminder` | Sim | OK |
| `conversation-followup` | `followup` | Sim | OK |
| `scheduled-followup` | `followup` | Sim | OK |
| `pattern-analysis` | `insight` | Sim | OK |
| `weekly-report` | `weekly_report` | Sim | OK |
| `instance-reconnect-notify` | `reconnect` | Sim | OK |
| `reactivation-blast` | `reactivation` | Sim | OK |
| `reactivation-check` (2 chamadas) | `reactivation` | Sim | OK |
| `recover-abandoned-checkout` | `checkout_recovery` | Nao (pre-cadastro) | OK (esperado) |
| `schedule-setup-reminder` (2 chamadas) | `checkin` | Sim | OK |
| `scheduled-checkin` | `checkin` | Sim | OK |
| `monthly-schedule-renewal` | `checkin` | Sim | OK |
| `periodic-content` | `content` | Sim | OK |
| `start-trial` | `welcome_trial` | Sim | OK |
| `admin-send-message` | dinamico | Sim | OK |
| `test-episode-send` | `content` | Sim | OK |
| `deliver-time-capsule` (3 chamadas) | `checkin` | Sim | OK |
| `send-meditation` (3 chamadas) | `content` | Sim | OK |

Nenhuma funcao usa `sendMessage()` para mensagens proativas. Todos os usos de `sendMessage` estao em `process-webhook-message` (respostas reativas dentro da janela de 24h) e `send-zapi-message` (envio manual de admin), o que e correto.

---

### Bug Ativo: Erro 21656 no template `checkout_recovery`

**Evidencia**: Nos dados de rede da pagina admin, checkouts recentes (01/04) estao falhando com:
```
Twilio template error [400]: {"code":21656,"message":"The Content Variables parameter is invalid."}
```

**Afetados**: Victor Cunha Silva, Renata silva botelho, Willians pereira, Raphael Venancio — todos com `status: failed`.

**Causa provavel**: O template `aura_checkout_recovery` (ContentSid `HX4d1154623f5338a325df9347db2c7d77`) esta esperando um formato de variavel diferente do que esta sendo enviado. A mensagem de recovery contem caracteres especiais (emojis, acentos, URLs com query params) que podem estar quebrando o formato JSON do `ContentVariables`, ou o template no Twilio Content foi atualizado/recriado com um formato de variavel diferente do esperado `{"1": "texto"}`.

**Investigacao necessaria**: Verificar no Twilio Content API se o template `HX4d1154623f5338a325df9347db2c7d77` aceita `{"1": "string"}` ou se espera outro formato (ex: nomes de variavel diferentes, ou multiplas variaveis).

### Plano de Correcao

1. **Diagnosticar o erro 21656**: Chamar a API do Twilio Content para inspecionar o template `HX4d1154623f5338a325df9347db2c7d77` e validar o formato esperado de variaveis
2. **Corrigir o formato de ContentVariables** na funcao `sendTemplateMessage` em `whatsapp-official.ts` se necessario, ou ajustar a mensagem para nao ter caracteres que quebram o JSON

### Templates no Banco

Todos os 13 templates estao `is_active: true` com ContentSid configurados. Nenhum esta com `PENDING_APPROVAL`.

