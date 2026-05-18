## Objetivo
Reabrir contato com a Débora Dias (`5581994070448`) usando template aprovado, já que a janela de 24h está fechada desde 10/mai.

## Template a usar
`cheking_7dias` — é o único check-in proativo aprovado no Twilio (per memória `approved-template-sids`). Usa Quick Reply, então quando ela clicar/responder reabre a janela de 24h e a Aura volta a operar normalmente via texto livre.

## Passos

1. **Buscar ContentSid do template `cheking_7dias`**
   - Query em `whatsapp_templates` para pegar o `content_sid` exato.

2. **Disparar via `sendProactive`** (função interna que respeita governança Twilio)
   - Destinatário: `5581994070448`
   - Template: `cheking_7dias`
   - Variável `{{1}}`: primeiro nome (`Débora`)
   - Registrar em `proactive_messages_log` para auditoria.

3. **Monitorar entrega**
   - Checar `edge_function_logs` do `send-proactive` por status Twilio (queued/sent/delivered).
   - Se Twilio retornar erro (número inválido, opt-out, etc.), reportar imediatamente — isso confirma se o problema é no número/canal dela ou no nosso lado.
   - Se entregar com sucesso e ela responder, a janela reabre e podemos responder o ticket de suporte com texto livre.

4. **Plano B se template falhar na entrega**
   - Erro `63016` (fora da janela sem template): impossível, estamos usando template.
   - Erro `21610` (opt-out): ela bloqueou; precisa enviar STAR/UNSTOP manualmente — responder via email do ticket.
   - Erro `63003` (channel not found): número errado/inativo no WhatsApp — confirmar com ela via email do ticket qual número usa.

## Observação
Não vamos enviar nenhuma mensagem de "teste" em texto livre. Apenas o template aprovado, que é seguro e dentro da política Meta/Twilio.

Confirma que disparo o `cheking_7dias` para ela agora?