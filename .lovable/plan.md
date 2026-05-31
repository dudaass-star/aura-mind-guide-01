## Objetivo
Destravar o Luiz (`6c88c2a1-e2cb-4f13-afbc-4bf0458fb0b8`) em dois pontos: (1) áudios de meditação não chegando, e (2) acesso ao `/meu-espaco` travado na tela "Confirma seu WhatsApp".

## Causa raiz comum
O telefone dele no banco está com **12 dígitos** (`556999825570`) — falta o `9` do nono dígito que o padrão BR exige. O Twilio entrega texto nesse formato em alguns casos, mas mídia (áudio) e variações de lookup falham. Corrigir o número resolve as duas frentes ao mesmo tempo.

## Passos

### 1. Backfill cirúrgico do telefone do Luiz
Migration única que normaliza só o profile dele:
- `UPDATE profiles SET phone = '5569999825570' WHERE id = <id_do_luiz> AND phone = '556999825570'`
- Idempotente (condicionado ao valor antigo)

### 2. Investigar entrega do áudio
- Ler `edge_function_logs` de `send-meditation` filtrado pelo `user_id` do Luiz nos últimos 7 dias
- Conferir `failed_message_log` e a tabela `messages` (registros com `media_url` para esse user)
- Cruzar com `aura-agent` logs procurando tags `[MEDITACAO:*]` que dispararam mas não geraram áudio
- Diagnóstico esperado: ou (a) tag não está sendo emitida, (b) `send-meditation` falha silenciosamente no Twilio por causa do telefone curto, ou (c) `audio_seconds_used = 0` mas a entrega não está sendo contabilizada

### 3. Validação
- Após o backfill, conferir que o profile do Luiz mostra `phone = '5569999825570'` e `length(phone) = 13`
- Pedir um teste manual: ele tenta entrar no Espaço (a tela `PhoneLinkPrompt` agora deve achar o profile pelo número correto)
- Em paralelo, com base no diagnóstico do passo 2, reportar o que causou a falha do áudio e propor o fix mínimo (sem aplicar agora)

## Fora de escopo
- Backfill em massa de outros profiles com 12 dígitos
- Mudanças no PhoneLinkPrompt, na UX de login ou no fluxo de OAuth
- Log estruturado em `failed_message_log` para `send-meditation`
- Qualquer alteração no `aura-agent`, `process-webhook-message`, ou normalização de phone no `_shared`

## Entrega
Após o passo 1 e 2, te trago: (a) confirmação de que o Luiz consegue logar, (b) diagnóstico da causa real do áudio não chegar, (c) recomendação de próximo passo (que pode ser um fix maior, se for sistêmico).
