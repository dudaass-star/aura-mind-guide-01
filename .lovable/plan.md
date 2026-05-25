## Objetivo
Validar a integração Meta Cloud API enviando mensagens de teste para `5551981519708` e confirmando entrega + recepção via webhook.

## Passos

1. **Diagnóstico prévio (read-only)**
   - Conferir logs do `webhook-meta` — ainda mostram 0 invocações, então a mensagem que você enviou ao número Meta não chegou. Provável: o campo `messages` não está realmente assinado **na app do WABA novo** (`2153650951869969`) ou o Phone Number ID configurado no secret não bate com o número que recebeu a mensagem.
   - Validar `META_WHATSAPP_PHONE_NUMBER_ID` vs número físico no Meta Business Manager via chamada GET na Graph API.

2. **Teste outbound — texto livre (não exige template)**
   - Chamar Graph API direto com `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` enviando `text` para `5551981519708`.
   - ⚠️ Só funciona se a janela de 24h estiver aberta (você já enviou msg, então **deveria** estar aberta — mas só se a msg chegou no número certo da WABA Meta).
   - Se Meta rejeitar com erro 131047 (fora da janela), confirma que a msg inbound não foi recebida pela WABA correta.

3. **Teste outbound — template (caso janela esteja fechada)**
   - Depende dos 3 templates (`cheking_7dias`, `jornada_disponivel`, `aura_weekly_report_v2`) estarem **aprovados** na nova WABA. Você disse que ainda não criou — então esse teste fica pendente.

4. **Teste inbound**
   - Você reenvia uma msg pro número da WABA Meta.
   - Eu checo logs do `webhook-meta` em tempo real pra confirmar que Meta está chamando a URL e o handler está processando.

## Detalhes técnicos
- Endpoint: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`
- Headers: `Authorization: Bearer {META_WHATSAPP_ACCESS_TOKEN}`
- Payload texto: `{messaging_product:"whatsapp", to:"5551981519708", type:"text", text:{body:"..."}}`
- Vou rodar via `code--exec curl` (não precisa criar edge function temporária).

## Saída esperada
- ✅ Caso sucesso: você recebe a msg no WhatsApp + log de inbound no `webhook-meta` quando responder.
- ❌ Caso falha: erro Meta específico (token inválido, janela fechada, phone number id errado) → corrijo na hora.

Aprove pra eu sair do plano e executar.