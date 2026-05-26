# Plano: novo App Meta + reconexão limpa do número Aura

A ideia é abandonar o app `AURA` (1491408882345218) atual, criar um App novo dentro do **mesmo Business Manager onde está o WABA `2153650951869969`**, e refazer toda a ligação (permissions → subscription → webhook) seguindo exatamente o passo a passo da documentação oficial da Cloud API. Assim eliminamos qualquer config legada invisível que esteja segurando os webhooks inbound do número `+1 555-959-6770` (Phone Number ID `1174296905760754`).

---

## Parte 1 — Criar o novo App no Meta

Tudo isso é feito por você no painel do Meta. Eu só preciso do **App ID** e do **System User Token** novo no final.

1. **developers.facebook.com** → logado com a conta que administra o Business Manager do WABA.
2. **My Apps → Create App**
   - Use case: **Other**
   - App type: **Business**
   - App name: `Aura WhatsApp` (ou o que preferir)
   - **Business Account**: selecionar o **mesmo Business Manager** onde está o WABA `2153650951869969`. Esse passo é o mais crítico — se errar aqui, a subscription nunca funciona.
3. Dentro do app → **Add products** → **WhatsApp → Set up**.
   - Selecionar o WABA existente `2153650951869969`.
   - Selecionar o número `+1 555-959-6770`.
4. App Review → **App Mode: Live** (botão no topo).

## Parte 2 — System User Token novo (Business Manager)

5. **business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema**.
6. Criar (ou reusar) um System User com role **Admin**.
7. **Adicionar ativos** → adicionar:
   - **Apps** → o novo app criado → permissão **Gerenciar app**.
   - **Contas do WhatsApp** → WABA `2153650951869969` → permissão **Gerenciar conta do WhatsApp**.
8. **Gerar novo token** com scopes:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - Expiração: **Nunca**.
9. Copiar o token e o **App ID** novo.

## Parte 3 — O que eu faço (após você me passar token + App ID)

10. Atualizo o secret `META_ACCESS_TOKEN` com o token novo.
11. Atualizo a constante `META_APP_ID` (e onde mais for referenciado) para o novo App ID.
12. Rodo `qa-meta-diagnose` para validar:
    - token vivo, type `SYSTEM_USER`, scopes corretos
    - app está em Live mode
    - WABA visível pelo token
    - número CONNECTED/VERIFIED
13. Disparo a **subscription do app no WABA** via API:
    `POST /2153650951869969/subscribed_apps` com o token novo
    e confirmo via `GET /2153650951869969/subscribed_apps` que o novo App ID aparece com `messages` ativo e **sem** `override_callback_uri`.
14. Configuro o **Webhook do produto WhatsApp** no novo app:
    - Callback URL: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-meta`
    - Verify token: o mesmo já configurado no secret `META_WEBHOOK_VERIFY_TOKEN`
    - Subscribe ao field **messages** (e `message_status` se quiser delivery receipts)
    - (Aqui você precisa clicar "Verify and Save" no painel — eu te aviso o momento exato e te passo o verify token.)
15. Teste end-to-end: você manda WhatsApp do `+55 51 98151-9708` para `+1 555-959-6770` e eu confirmo no log do `webhook-meta` que o `entry` chegou e o pipeline da Aura processou.

## Parte 4 — Limpeza pós-migração

16. Após confirmar que o novo app recebe mensagens, **desinscrever o app antigo** (`1491408882345218`) do WABA:
    `DELETE /2153650951869969/subscribed_apps` autenticado como o app antigo, para garantir que não fica um segundo callback fantasma.
17. Manter o app antigo desativado em Dev mode (não precisa deletar).

---

## Detalhes técnicos

- Endpoints Graph API v21.0:
  - `GET /me?fields=id,name` (sanity do token)
  - `GET /{APP_ID}?fields=id,name,link` (confirmar Live)
  - `GET /{WABA_ID}?fields=id,name,owner_business_info`
  - `GET /{WABA_ID}/subscribed_apps?fields=whatsapp_business_api_data,override_callback_uri`
  - `POST /{WABA_ID}/subscribed_apps` (sem body)
  - `GET /{PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,code_verification_status,status,quality_rating,platform_type,webhook_configuration`
- Secrets a atualizar:
  - `META_ACCESS_TOKEN` (novo SU token)
  - `META_APP_ID` (se existir como secret; caso esteja hardcoded, edito o código)
  - `META_WEBHOOK_VERIFY_TOKEN` permanece o atual `aura_ig_verify_2026` (a menos que você queira rotacionar)
- Não vou tocar em `webhook-meta/index.ts` — o handler já está validado e recebendo do Twilio/Instagram. O problema é só de subscription do app.
- Não vou mexer em nada do Twilio nem do número principal da Aura.

## O que eu preciso de você para arrancar a Parte 3

1. **App ID** do novo app criado.
2. **System User Token** novo (cole no chat depois que eu pedir o secret — não cole agora).
3. Confirmação de que o WABA `2153650951869969` aparece atribuído ao novo app no Business Manager.
