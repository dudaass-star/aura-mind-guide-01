

## Notificação de reconexão para usuários ativos — envio intercalado via WhatsApp

### O que será feito

Criar uma nova Edge Function `instance-reconnect-notify` que envia uma mensagem curta e acolhedora para todos os usuários ativos/trial de uma instância que acabou de reconectar, com envio intercalado (25-45s entre cada mensagem) para evitar burst.

### Abordagem

A função segue o mesmo padrão já usado no `reactivation-blast`:
- Recebe o `instance_id` da instância reconectada (ou busca todas com status `active` que tinham `disconnected` recentemente)
- Busca usuários com `status IN ('active', 'trial')` vinculados àquela instância
- Envia mensagem intercalada usando `antiBurstDelayForInstance`
- Respeita horário silencioso (22h-8h BRT)

### Arquivo novo

**`supabase/functions/instance-reconnect-notify/index.ts`**

- Aceita `{ instance_id?: string }` no body (opcional — se omitido, notifica todas as instâncias ativas)
- Query: `profiles` onde `status IN ('active', 'trial')` e `whatsapp_instance_id = instance_id` e `phone IS NOT NULL`
- Mensagem curta e natural: `"Oi, {nome}! Tive um probleminha técnico, mas já voltei. 💚 Se você me mandou algo e eu não respondi, pode mandar de novo que estou aqui!"`
- Usa `antiBurstDelayForInstance` entre cada envio (25-45s)
- Não salva na tabela `messages` (é aviso operacional, não conversa)
- Retorna contagem de enviados/erros

### Disparo

A função será chamada manualmente via admin ou via cURL/invoke. Opcionalmente, pode-se adicionar um botão no painel admin de instâncias.

### Integração com check-instance-health (opcional)

Adicionar detecção automática de reconexão no `check-instance-health`: quando status muda de `disconnected` → `active`, disparar a notificação automaticamente.

