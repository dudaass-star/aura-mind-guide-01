

# Ativar API Oficial do WhatsApp — Análise de Prontidão

## Situação Atual

A infraestrutura de **envio** via API oficial está pronta (provider abstraction, templates, teaser+link). Porém há **lacunas críticas** que impedem a ativação imediata.

## Problemas que Bloqueiam a Ativação

### 1. NÃO EXISTE webhook de recebimento Twilio (BLOQUEADOR)

O sistema só tem `webhook-zapi` para receber mensagens dos usuários. Não existe um `webhook-twilio` que:
- Receba o payload do Twilio (formato diferente do Z-API)
- Parse os campos (`Body`, `From`, `MediaUrl0`, `MessageSid`)
- Faça deduplicação
- Atualize `last_user_message_at`
- Encaminhe para `process-webhook-message`

**Sem isso, a Aura não consegue receber mensagens dos usuários.**

### 2. `process-webhook-message` usa Z-API diretamente (BLOQUEADOR)

O worker principal (1090 linhas) que processa mensagens e chama o `aura-agent` usa `sendTextMessage` do `zapi-client.ts` diretamente — não passa pelo provider abstraction. As respostas da Aura seriam enviadas via Z-API mesmo com provider = official.

### 3. ~20 funções ainda usam Z-API diretamente (IMPORTANTE)

Funções como `conversation-followup`, `scheduled-checkin`, `session-reminder`, `reactivation-check`, `start-trial`, `aura-agent`, `pattern-analysis`, etc. todas importam `sendTextMessage` do `zapi-client.ts`.

## Plano de Ativação (por prioridade)

### Fase 1 — Recebimento (OBRIGATÓRIO)
- Criar `webhook-twilio/index.ts` — recebe mensagens Twilio, normaliza payload, encaminha para `process-webhook-message`
- Configurar webhook URL no Twilio para apontar para esta função

### Fase 2 — Respostas (OBRIGATÓRIO)
- Atualizar `process-webhook-message` para usar `sendMessage` do `whatsapp-provider.ts` em vez de `sendTextMessage` do `zapi-client.ts`
- Atualizar `aura-agent` para usar o provider abstrato

### Fase 3 — Proatividade (IMPORTANTE)
- Migrar as ~15 funções proativas para usar `sendProactive`/`sendMessage` do provider
- Inclui: `conversation-followup`, `scheduled-checkin`, `session-reminder`, `weekly-report`, `reactivation-check`, `start-trial`, `pattern-analysis`, etc.

### Fase 4 — Ativação
- Inserir `whatsapp_provider = 'official'` na `system_config`
- Configurar webhook Twilio apontando para a nova edge function

## Recomendação

Começar pela **Fase 1** (criar `webhook-twilio`) e **Fase 2** (migrar `process-webhook-message` e `aura-agent`). Isso garante que o fluxo principal (receber → processar → responder) funcione via API oficial. As funções proativas podem ser migradas incrementalmente.

Quer que eu comece pela Fase 1 (criar o webhook de recebimento Twilio)?

