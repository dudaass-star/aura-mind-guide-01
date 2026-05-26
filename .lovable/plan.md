Você está certo: `name_status=PENDING_REVIEW` não deve ser tratado como bloqueio de funcionamento. Pela documentação da Meta, o requisito operacional para enviar/receber via Cloud API é o número estar registrado/conectado; e aqui ele está `code_verification_status=VERIFIED`, `status=CONNECTED`, `platform_type=CLOUD_API`, `quality_rating=GREEN`.

Plano de investigação correto agora:

1. Remover essa hipótese do diagnóstico
   - Parar de classificar `name_status` como causa de falha.
   - Usar `name_status` apenas como informação visual/revisão de display name.

2. Auditar os 3 pontos que a documentação da Meta aponta como bloqueadores reais de webhook
   - App em Live mode: a própria doc de Webhooks diz que alguns webhooks não são enviados se o app estiver em Dev mode.
   - Assinatura do App no objeto `whatsapp_business_account` com campo `messages` ativo.
   - Assinatura da WABA no App via `/{WABA_ID}/subscribed_apps`.

3. Auditar override de webhook, que é uma hipótese forte agora
   - A doc de Webhook Overrides diz que `messages` pode ser redirecionado por callback alternativo no nível do número ou da WABA.
   - Se existir override em `1174296905760754` ou em `2153650951869969`, a Meta pode estar mandando o inbound para outro endpoint, mesmo com o App callback correto.
   - Vou expandir o `qa-meta-diagnose` para consultar:
     - `GET /1174296905760754?fields=webhook_configuration`
     - `GET /2153650951869969/subscribed_apps` incluindo `override_callback_uri`

4. Confirmar se o webhook está recebendo qualquer POST da Meta
   - Hoje os logs mostram zero chamadas reais recentes em `webhook-meta`.
   - Isso significa que o problema ainda está antes do nosso código de parsing: Meta não está entregando POST para este endpoint, ou está entregando para outro endpoint por override/configuração.

5. Se houver override errado, corrigir por API
   - Remover override do número ou da WABA, ou apontar explicitamente para:
     `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-meta`
   - Depois pedir novo teste de mensagem e validar chegada de payload com:
     - `entry.id = 2153650951869969`
     - `metadata.phone_number_id = 1174296905760754`
     - `value.messages[0].from = 5551981519708`

6. Se não houver override, o próximo foco será App mode / configuração no App Dashboard
   - Como token, WABA subscription e App subscription já estão OK, o próximo bloqueador compatível com a doc é o App não estar Live ou o produto WhatsApp do App estar em configuração inconsistente.

Resultado esperado: transformar o diagnóstico em evidência objetiva: ou encontramos override/callback errado, ou isolamos o bloqueio no modo/configuração do App Meta — sem voltar para a hipótese incorreta do nome.