# Investigação: msg de recuperação não chegou no +5551981519708

## O que sabemos
- API da Twilio aceitou o envio (HTTP 201, `status: queued`, `error_code: null`).
- `From: whatsapp:+19123014009` (número novo, recém-trocado).
- `To: whatsapp:+5551981519708` (correto).
- ContentSid `HX7ae71f9002839ec0ecdc58f6aa067a8a` (template do estágio 15min, aprovado anteriormente na subaccount).
- Status `queued` é só "Twilio recebeu" — não significa entregue. O motivo da não entrega aparece só ao consultar a Messages API depois (`status` final + `error_code`).

## Hipóteses mais prováveis (por ordem)
1. **Sender WhatsApp do novo número (+19123014009) não está aprovado / não tem WABA ativo** → Twilio aceita o POST mas marca como `failed`/`undelivered` com error 63007 ("Channel not found") ou 63016 ("Failed to send freeform message because you are outside the allowed window").
2. **Templates `HX7ae71f...` e `HXb34b27...` não estão linkados/aprovados ao novo sender** → mesmo ContentSid, mas a aprovação de template no WhatsApp é por WABA. Se trocou de WABA junto com o número, precisa reaprovar. Erro típico: 63016 ou 63051.
3. **Número de destino não opt-in no novo sender** → erro 63015/63016.
4. **Twilio sandbox vs production sender** → se +19123014009 ainda for sandbox, exige `join <code>` no celular antes.

## Plano de ação

### Passo 1 — Buscar status real do envio na Twilio (read-only)
Estender o utilitário `twilio-recovery-client.ts` já tem `getRecoveryMessage(messageSid)` e `getRecoveryAlerts(messageSid)`. Vou adicionar um pequeno endpoint de diagnóstico:

- Nova função `test-whatsapp-recovery-status` que recebe `messageSid` e devolve:
  - GET `/Messages/{sid}.json` → status final, error_code, error_message
  - GET `monitor.twilio.com/v1/Alerts?ResourceSid={sid}` → detalhe do erro de delivery

### Passo 2 — Interpretar resultado
Com o `error_code` em mãos, decide o próximo passo:

| Erro | Causa | Ação |
|------|-------|------|
| 63007 | Canal/sender inexistente | Configurar WhatsApp Sender no console Twilio para +19123014009 |
| 63016 | Fora da janela 24h e template não casa | Reaprovar templates no novo WABA |
| 63051 | Template inválido/não aprovado | Submeter templates pra aprovação no novo WABA |
| 63015 | Recipient não opted-in (sandbox) | Fazer `join <code>` no celular |
| `delivered` | Entregou mesmo | Verificar spam/arquivado no WhatsApp do destinatário |

### Passo 3 — Reenviar após correção
Reusar `test-whatsapp-recovery` pra disparar de novo após o fix.

## Detalhes técnicos
- Arquivo novo: `supabase/functions/test-whatsapp-recovery-status/index.ts` (~30 linhas, reaproveita `getRecoveryMessage` e `getRecoveryAlerts` já exportados).
- Sem mudanças em DB, sem mudanças em produção, só ferramenta de diagnóstico.
- A função `test-whatsapp-recovery` existente fica como está.

Quer que eu siga e crie o endpoint de status pra checar o erro real da Twilio?
