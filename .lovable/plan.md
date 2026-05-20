## Recuperação de carrinho abandonado via WhatsApp (Twilio subaccount)

Roda **em paralelo** ao fluxo atual de e-mail (1h/25h/97h), em 2 estágios (15min + 24h), via uma **subaccount Twilio dedicada**, respeitando silêncio 22h-08h BRT e pulando clientes já ativos/trial.

### 1. Secrets (usuário precisa adicionar)

Após criar a subaccount no Twilio Console:
- `TWILIO_RECOVERY_ACCOUNT_SID` — AC... da subaccount
- `TWILIO_RECOVERY_AUTH_TOKEN` — Auth Token da subaccount
- `TWILIO_RECOVERY_FROM` — número WhatsApp da subaccount no formato `whatsapp:+...`

Os 2 ContentSids dos templates aprovados também precisam estar prontos para registro no DB.

### 2. Migration (schema)

Adicionar em `checkout_sessions`:
- `whatsapp_recovery_15min_sent_at timestamptz`
- `whatsapp_recovery_24h_sent_at timestamptz`
- `whatsapp_recovery_last_error text`

Inserir 2 linhas em `whatsapp_templates` com os ContentSids:
- `HX7ae71f9002839ec0ecdc58f6aa067a8a` (estágio 15min)
- `HXb34b27fda2f45a0c10fc19960bac61c1` (estágio 24h)

### 3. Helper novo

`supabase/functions/_shared/twilio-recovery-client.ts` — cliente REST direto para a subaccount (Basic Auth com SID+Token da subaccount), envio via Content API (`ContentSid` + `ContentVariables`), retry para erros transientes (429/5xx).

### 4. Edge function nova

`supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`:

- **Pré-busca de ativos** (igual ao fluxo de e-mail): `SELECT phone, email FROM profiles WHERE status IN ('active','trial')` → monta `activePhoneSet` (com `getPhoneVariations`) e `activeEmailSet`
- **Skip explícito**: antes de cada envio, se o `phone` ou `email` do `checkout_session` bate com os Sets → grava em `checkout_recovery_attempts` com status `wa_stage_X_skipped:active_customer` e marca o `sent_at` para não reavaliar
- **Quiet hours BRT**: se hora atual em São Paulo está entre 22h-08h → função retorna sem enviar nada (o cron de 5min reavalia logo depois das 8h)
- **Estágio 15min**: `status='created'` AND `created_at < now()-15min` AND `whatsapp_recovery_15min_sent_at IS NULL` AND `phone IS NOT NULL` AND `email NOT IN active`
- **Estágio 24h**: idem + `created_at < now()-24h` AND `whatsapp_recovery_24h_sent_at IS NULL` AND `whatsapp_recovery_15min_sent_at IS NOT NULL`
- **Variáveis**: `{{1}} = primeiro nome`, `{{2}} = plano` (a confirmar conforme templates)
- **Link**: `https://olaaura.com.br/checkout?plan=${plan}&utm_source=whatsapp&utm_medium=recovery&utm_campaign=stage${1|2}` (enviado pelo botão CTA do template)
- Loga sucesso/erro em `checkout_recovery_attempts` (status `wa_stage_X_sent` / `wa_stage_X_failed`)

### 5. Cron

Via `pg_cron + pg_net`: invocar `recover-abandoned-checkout-whatsapp` a cada 5 minutos.

### 6. Sem mudanças em

- `recover-abandoned-checkout` (e-mail continua igual, 3 estágios)
- `whatsapp-official.ts` / `TWILIO_WHATSAPP_FROM` (canal da Aura intocado)
- Qualquer fluxo conversacional

### Pendências antes de codar

Preciso só que você me passe (ou confirme):
1. Os 3 secrets da subaccount já estão configurados? Se não, posso disparar o pedido com `add_secret`.
2. Os 2 templates aprovados têm **quantas variáveis** cada um e o **botão CTA** é dinâmico (URL via variável) ou fixo? Isso muda o `ContentVariables` que vou enviar.
