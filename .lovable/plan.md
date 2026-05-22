# Corrigir telefone da Cleusa Santana

## Contexto
- Profile ID: `76630273-36bf-4a51-8433-6f090cf9c171`
- Email: cleusasantana1991@gmail.com
- Telefone atual (errado): `5555479338940` — número inexistente no WhatsApp, por isso Aura nunca recebeu nenhuma mensagem dela em 8 dias
- Telefone correto informado: **(47) 99250-2602** → normalizado: `5547992502602`
- Nenhum outro profile usa esse número (sem colisão)

## Ação
1. Atualizar `profiles.phone` de `5555479338940` → `5547992502602` (via insert tool, `UPDATE`)
2. Verificar se há `zapi_message_dedup` / `messages` órfãs vindas do número correto (mensagens dela tentando falar nos últimos 8 dias que caíram em "usuário não encontrado") e, se houver, reatribuir ao `user_id` dela
3. Resetar `pending_first_session_invite` se necessário, para que o convite D0 seja reentregue corretamente agora que o número funciona
4. Disparar uma mensagem de boas-vindas/reativação manual (template aprovado) confirmando que está tudo funcionando

## Validação
- Confirmar no Twilio que envios para `+5547992502602` saem com sucesso (sem 63003/63112)
- Aguardar primeira resposta inbound dela e verificar nos logs do `webhook-twilio` que o profile é resolvido corretamente
