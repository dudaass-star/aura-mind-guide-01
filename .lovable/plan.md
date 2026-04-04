

## Plano: Ativar templates aprovados e testar envio

### O que será feito

**1. Atualizar os 3 templates aprovados no banco de dados**

Usando a página `/admin/templates` (ou via migração), atualizar o `twilio_content_sid` e `is_active = true` para:

| Template | Content SID |
|---|---|
| `aura_welcome_v2` | `HXa5ef9baff62dd1648c8e37f0ca03b054` |
| `aura_welcome_trial_v2` | `HXba985652a6a517aac0f9732321398dee` |
| `aura_reconnect_v2` | `HX824b3f789beb78ace2a1f38d8527c718` |

Será feito via migração SQL (`UPDATE whatsapp_templates SET twilio_content_sid = '...', is_active = true WHERE category = '...'`) para garantir que os 3 sejam atualizados de uma vez.

**2. Testar envio de welcome para Eduardo**

Após ativar os templates, invocar a edge function `start-trial` ou chamar diretamente `sendProactive` para o número `5551981519708` com a categoria `welcome` para validar que o template está funcionando corretamente no Twilio/Meta.

Vou usar a edge function `test-episode-send` como referência para criar uma chamada de teste rápida, ou invocar diretamente via curl a lógica de envio.

### Detalhes técnicos
- A migração atualiza apenas os 3 templates que aparecem como aprovados na screenshot
- Os outros 8 templates continuam com `PENDING_APPROVAL` e `is_active = false`
- O teste envia uma mensagem real via Twilio para o número informado

