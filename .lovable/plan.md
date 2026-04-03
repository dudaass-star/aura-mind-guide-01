

## Plano: Migrar para o Novo Número WhatsApp +16625255005

### Contexto
O novo WhatsApp Sender está ativo no Twilio. O sistema já lê o número de envio do secret `TWILIO_WHATSAPP_FROM`, então **a única mudança necessária é atualizar esse secret**.

Nenhum código precisa ser alterado — a função `getFromNumber()` em `whatsapp-official.ts` já normaliza qualquer formato de número automaticamente.

### O que será feito

**1. Atualizar o secret `TWILIO_WHATSAPP_FROM`**
- Valor atual: `+12604684990` (banido)
- Novo valor: `+16625255005`

**2. Templates oficiais**
- Como os templates ainda não foram criados na Meta, o sistema vai operar em **modo free-text** (mensagens dentro da janela de 24h) para usuários que já iniciaram conversa.
- Mensagens proativas fora da janela de 24h **não funcionarão** até os templates serem aprovados pela Meta — isso é esperado e não causa erro (o sistema já trata esse cenário com graceful fallback).

### O que NÃO muda
- Nenhum código alterado
- Webhook do Twilio (`webhook-twilio`) permanece o mesmo — basta configurar o webhook no Twilio Console para o novo sender apontar para a mesma URL
- Toda a infraestrutura (provider abstraction, instance helper, anti-burst) continua funcionando

### Checklist para você (no Twilio Console)
- ✅ Novo sender ativo
- ⬜ Configurar webhook de mensagens recebidas no novo sender para: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-twilio` (POST)

