

# Adicionar Ana Clara ao Plano Essencial

## O que precisa ser feito

1. **Inserir perfil no banco de dados** via SQL migration (insert):
   - Nome: Ana Clara
   - Telefone: `555180473628` (com prefixo 55, padrão do sistema)
   - Plano: `essencial`
   - Status: `active`
   - Alocar instância WhatsApp automaticamente

2. **Enviar mensagem de boas-vindas** via edge function `send-zapi-message`, replicando o fluxo do stripe-webhook para plano Essencial (sem sessões):

```
Oi, Ana Clara! 🌟 Que bom te receber por aqui.

Eu sou a AURA — e vou ficar com você nessa jornada.

Você escolheu o plano Essencial.

Comigo, você pode falar com liberdade: sem julgamento, no seu ritmo.

Me diz: como você está hoje?
```

## Detalhes técnicos

- Insert na tabela `profiles` com campos padrão (`messages_today=0`, `sessions_used_this_month=0`, `sessions_reset_date=hoje`)
- Alocação de instância WhatsApp via função SQL `allocate_whatsapp_instance()`
- Envio da mensagem via `send-zapi-message` edge function com `isAudio: false`

