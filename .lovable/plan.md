

## Plano: Migrar WhatsApp 100% para Meta Cloud API (eliminar Twilio)

### Pré-requisito

Você precisa fornecer o **Phone Number ID** da Meta (número de ~15 dígitos, encontrado em Meta Business Suite → WhatsApp → Configurações da API). Será salvo como secret `META_WHATSAPP_PHONE_NUMBER_ID`.

### O que muda

| Funcionalidade | Hoje (Twilio Gateway) | Depois (Meta Cloud API direta) |
|---|---|---|
| Texto livre (24h) | `POST connector-gateway.lovable.dev/twilio/Messages.json` | `POST graph.facebook.com/v21.0/{phone_id}/messages` com `type: text` |
| Templates | `ContentSid` do Twilio | `template.name` direto da Meta |
| Áudio via URL | Twilio `MediaUrl` | Meta `type: audio` com `link` |
| Recebimento (webhook) | `webhook-twilio` (form-urlencoded Twilio) | Novo `webhook-meta` (JSON da Meta Cloud API) |

### Etapas de implementação

**1. Adicionar secret `META_WHATSAPP_PHONE_NUMBER_ID`**

**2. Reescrever `whatsapp-official.ts`**
- Remover todas as referências ao Twilio Gateway (`GATEWAY_URL`, `getGatewayHeaders`, `TWILIO_API_KEY`, `LOVABLE_API_KEY`)
- `sendFreeText()` → `POST graph.facebook.com/v21.0/{phone_id}/messages` com `Authorization: Bearer META_ACCESS_TOKEN` e body `{ messaging_product: "whatsapp", to: "55...", type: "text", text: { body: "..." } }`
- `sendTemplateMessage()` → Usar `template_name` do banco diretamente (não mais `ContentSid`): `{ type: "template", template: { name: "...", language: { code: "pt_BR" }, components: [...] } }`
- `sendAudioFromUrl()` → `{ type: "audio", audio: { link: "..." } }`
- Manter toda a lógica existente de 24h window, splitting, proactive messaging

**3. Adicionar coluna `language_code` na tabela `whatsapp_templates`**
- Default `pt_BR`
- Campo `twilio_content_sid` se torna legado (não deletar, mas não será mais usado para envio)

**4. Criar novo webhook `webhook-meta`**
- Recebe JSON da Meta Cloud API (formato diferente do Twilio)
- Extrai phone, text, audio, image do payload Meta
- Normaliza e envia para `process-webhook-message` (mesmo padrão do webhook-twilio)
- Implementa verificação de webhook (Meta exige resposta ao challenge GET com `hub.verify_token`)

**5. Atualizar `whatsapp-provider.ts`**
- Remover imports do Twilio
- O provider `official` agora chama as funções reescritas (Meta direta)
- Manter provider `zapi` como fallback (sem mudança)

**6. Atualizar painel `/admin/templates`**
- Mostrar `language_code` em vez de `ContentSid`
- `ContentSid` vira campo legado (oculto ou read-only)

**7. Configurar webhook no Meta Business Suite**
- Após deploy do `webhook-meta`, você configurará a URL do webhook na Meta
- URL será: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-meta`
- O verify_token será um secret que definiremos

### O que NÃO muda
- `whatsapp-provider.ts` continua como camada de abstração (zapi vs official)
- `process-webhook-message` não muda (recebe o mesmo payload normalizado)
- Toda a lógica de retry, failed_message_log, janela 24h permanece
- O `webhook-twilio` será mantido temporariamente até confirmar que o Meta webhook funciona

### Riscos e mitigação
- **Transição suave**: manter `webhook-twilio` ativo durante testes, só desativar após validação
- **Token Meta**: o `META_ACCESS_TOKEN` já existe como secret; tokens de longa duração do Meta expiram em ~60 dias — monitorar renovação

