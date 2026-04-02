

## Verificação Completa das Mensagens Proativas — Estado Atual

### Por que não detectei antes?

Durante a implementação dos templates, o foco foi na criação da infraestrutura (tabela `whatsapp_templates`, lógica de `sendProactive` no `whatsapp-provider.ts`, função `sendProactiveMessage` no `whatsapp-official.ts`). A auditoria das funções que **chamam** `sendProactive` foi parcial — corrigi apenas as que estavam sendo ativamente testadas naquele momento (`periodic-content`, `start-trial`, `admin-send-message`). As demais ficaram com a assinatura antiga `sendProactive(phone, text)` sem os parâmetros de template.

Sobre as simulações de custo: elas consideraram apenas as categorias de template que já estavam configuradas corretamente. As funções que usavam o default `checkin` foram contadas como check-ins, quando na verdade são mensagens de tipos diferentes (followup, insight, reactivation, etc.) com categorias Meta distintas (utility vs marketing) e custos diferentes.

---

### Estado Atual Pós-Correção

Todas as 16 funções que usam `sendProactive()` foram verificadas. Aqui está o status completo:

| Função | Chamadas | Template | userId | Status |
|--------|----------|----------|--------|--------|
| `session-reminder` | 11 | `session_reminder` | ✅ | ✅ Corrigido |
| `conversation-followup` | 1 | `followup` | ✅ | ✅ Corrigido |
| `scheduled-followup` | 1 | `followup` | ✅ | ✅ Corrigido |
| `pattern-analysis` | 1 | `insight` | ✅ | ✅ Corrigido |
| `weekly-report` | 1 | `weekly_report` | ✅ | ✅ Corrigido |
| `instance-reconnect-notify` | 1 | `reconnect` | ✅ | ✅ Corrigido |
| `reactivation-blast` | 1 | `reactivation` | ✅ | ✅ Corrigido |
| `reactivation-check` | 2 | `reactivation` | ✅ | ✅ Corrigido |
| `recover-abandoned-checkout` | 1 | `checkout_recovery` | ❌ (sem userId) | ✅ Corrigido |
| `schedule-setup-reminder` | 2 | `checkin` | ✅ | ✅ Corrigido |
| `periodic-content` | 1 | `content` | ✅ | ✅ Já estava OK |
| `start-trial` | 1 | `welcome_trial` | ✅ | ✅ Já estava OK |
| `admin-send-message` | 1 | dinâmico | ✅ | ✅ Já estava OK |
| `test-episode-send` | 1 | `content` | ✅ | ✅ Já estava OK |

### Problemas Remanescentes Encontrados

#### Bug 1: `monthly-schedule-renewal` — sem template nem userId
**Linha 85**: `sendProactive(user.phone, message)` — usa default `checkin` sem userId.
Não existe template específico para "renovação mensal". Poderia usar `checkin` (é operacional) mas precisa do `userId` para verificar janela de 24h.

#### Bug 2: `scheduled-checkin` — sem userId
**Linha 115**: `sendProactive(cleanPhone, message)` — template `checkin` é o correto (default), mas falta o `userId` para verificar a janela de 24h. Sem ele, o sistema não consegue consultar `last_message_date` para decidir entre texto livre e template.

#### Bug 3: `deliver-time-capsule` — usa `sendMessage` em vez de `sendProactive`
**Linhas 72, 85, 92**: Usa `sendMessage()` para enviar mensagens proativas (cápsula do tempo). Fora da janela de 24h, `sendMessage` tenta enviar texto livre pela API Oficial, que será **bloqueado pela Meta**. Deveria usar `sendProactive` com um template adequado (não existe template específico para time capsule).

#### Bug 4: `send-meditation` — usa `sendMessage` em vez de `sendProactive`
**Linhas 145, 169, 189**: Mesma situação. Envia intro de meditação e fallback via `sendMessage`, que será bloqueado fora da janela de 24h.

### Impacto nas Simulações de Custo

As simulações anteriores estavam imprecisas por dois motivos:
1. **Categorização errada**: Funções que enviam `followup`, `insight`, `reactivation` etc. estavam sendo contadas como `checkin` (utility). Templates de `reactivation` e `checkout_recovery` são **marketing** (custo ~1.8x maior).
2. **Funções invisíveis**: `deliver-time-capsule` e `send-meditation` usam `sendMessage` em vez de `sendProactive`, então nem entraram na contagem de templates — mas fora da janela simplesmente **falham silenciosamente**.

### Plano de Correção

#### Correção 1: `monthly-schedule-renewal/index.ts`
Passar userId para `sendProactive`:
```
sendProactive(user.phone, message, 'checkin', user.user_id)
```

#### Correção 2: `scheduled-checkin/index.ts`
Passar userId:
```
sendProactive(cleanPhone, message, 'checkin', profile.user_id)
```

#### Correção 3: `deliver-time-capsule/index.ts`
Substituir `sendMessage` por `sendProactive` nas 3 chamadas. Usar template `checkin` (mais genérico disponível) ou criar template `time_capsule`.

#### Correção 4: `send-meditation/index.ts`
Substituir `sendMessage` por `sendProactive` nas 3 chamadas. Usar template `content` (é conteúdo da Aura).

#### Decisão necessária para Bugs 3 e 4:
Criar novos templates no Meta para `time_capsule` e `meditation`, ou reutilizar templates existentes (`checkin` / `content`)?

### Resumo de Custos Corrigido

Com a categorização correta, o custo por tipo de mensagem proativa na API Oficial é:

| Categoria Meta | Templates | Custo aprox. (BRL) |
|---|---|---|
| **Utility** | checkin, followup, insight, weekly_report, reconnect, content, session_reminder, welcome, welcome_trial, dunning | ~R$ 0,05/msg |
| **Marketing** | reactivation, checkout_recovery, access_blocked | ~R$ 0,09/msg |

