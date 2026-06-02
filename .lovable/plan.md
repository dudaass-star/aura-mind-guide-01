## Objetivo
Validar envio outbound pelo número novo (Meta Cloud API) para `5551981519708`, sem tocar no número oficial Twilio.

## Execução (1 passo único)
Invocar `qa-meta-send` via GET:
- `to=5551981519708`
- `body=Teste Aura via Meta Cloud API ✅ (outbound isolado, sem Twilio)`

Essa função chama `graph.facebook.com/v21.0/{META_WHATSAPP_PHONE_NUMBER_ID}/messages` direto com `META_WHATSAPP_ACCESS_TOKEN`. Não passa por `whatsapp-provider`, não lê `system_config`, não grava em `messages`, não toca templates. Twilio prod fica 100% intocado.

## Verificação
Retorno do Graph API mostra:
- `phoneNumberInfo` (display_phone_number + verified_name) — confirma que o nome aprovado está ativo
- `sendStatus` (200 esperado) e `sendResponse.messages[0].id` (wamid)

Se falhar, leio o `error.code` da Meta sem retry e sem mudar nada mais.

## Observação importante (fora do escopo deste teste)
Você mandou msg pro número novo Meta e a Aura respondeu pelo Twilio. Isso é esperado com a config atual: `webhook-meta` recebe o inbound e entrega pro `aura-agent`, que envia a resposta pelo provider definido em `system_config.whatsapp_provider` (= `twilio` hoje). Ou seja:
- Inbound Meta → processado normalmente
- Outbound da resposta → sai pelo Twilio (número oficial)

Isso **não quebra nada**, mas cria a sensação de "número trocado" pro usuário final. Quando formos migrar de verdade, o plano é:
1. Criar templates aprovados no Meta
2. Trocar `system_config.whatsapp_provider` para `meta`
3. Aposentar Twilio

Por enquanto, mantemos assim e seguimos só com o teste outbound isolado acima.

## Próximo passo após aprovação
Rodo o `qa-meta-send` e te devolvo o status + wamid. Você confirma se chegou no WhatsApp pelo número novo.