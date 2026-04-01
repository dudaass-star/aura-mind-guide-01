

# Fix: Testar envio para Eduardo com dados corretos + corrigir bug de phone vazio

## Diagnóstico

O envio anterior usou o `user_id` errado (`965f2428...`). O Eduardo real é:
- **user_id**: `329ebadd-07eb-4e1e-88db-d8974b2ea3e5`  
- **phone**: `555181519708`
- **last_user_message_at**: `2026-03-31 23:45:03` (dentro da janela de 24h!)

Como a janela de 24h está aberta, o sistema vai enviar como **free text** (grátis), não template.

## Plano

### 1. Reenviar teste com user_id correto
Invocar `admin-send-message` com:
```json
{
  "phone": "555181519708",
  "message": "Oi Eduardo! Esta é uma mensagem de teste da Aura via API oficial. 🌟",
  "user_id": "329ebadd-07eb-4e1e-88db-d8974b2ea3e5"
}
```

### 2. Bug secundário: `session-reminder` enviando para phone vazio
Os logs mostram `Sending template to whatsapp:+` (sem dígitos) + erro 21656 de Content Variables inválido. Isso indica um usuário com phone nulo/vazio na tabela profiles. Precisamos adicionar guard clause nas funções que enviam mensagens para pular usuários sem phone válido.

## Resultado Esperado
- Eduardo recebe a mensagem no WhatsApp
- Confirma que o fluxo outbound via Twilio funciona end-to-end

