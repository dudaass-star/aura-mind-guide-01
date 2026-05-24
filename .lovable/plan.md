## Painel WhatsApp Inbox — `/admin/whatsapp-inbox`

Página admin com duas abas (**Oficial** e **Recuperação**) para acompanhar conversas e responder.

---

### 1. Aba "Oficial" (+16625255005)

Reusa o que já existe — toda conversa com usuário registrado já está em `messages` + `profiles`.

- Lista lateral: profiles ordenados por `last_user_message_at DESC`, com:
  - nome / telefone
  - prévia da última mensagem
  - badge "novo" se `last_user_message_at > last_admin_read_at`
  - filtro/busca por nome/telefone
- Painel direito: histórico de `messages` do `user_id` selecionado (role user/assistant) com timestamps BRT
- Caixa de resposta: envia como **admin override** via nova edge function `whatsapp-admin-reply` (texto puro pelo número oficial). Grava em `messages` com `role='assistant'` e flag `metadata.sent_by_admin=true` (precisa adicionar coluna `metadata jsonb` em `messages`, ou tabela à parte — ver técnico)
- Realtime: já existe canal em `messages` para admin

### 2. Aba "Recuperação" (Twilio subaccount, TWILIO_RECOVERY_FROM)

Hoje **não há captura de respostas** desse número — o webhook da subaccount não está apontando pra lugar nenhum. Vamos criar a infraestrutura:

- Nova tabela `recovery_conversations` (telefone como chave + última atividade)
- Nova tabela `recovery_messages` (direction in/out, body, media_url, message_sid, created_at, read_at)
- Nova edge function `webhook-twilio-recovery` — recebe POSTs da subaccount, grava inbound, marca conversa como não-lida, tenta linkar com `checkout_sessions` por telefone para mostrar contexto (plano, valor abandonado, link de retomar)
- `recover-abandoned-checkout-whatsapp` passa a logar cada outbound em `recovery_messages` (direction=out)
- UI igual à aba Oficial: lista lateral por telefone, painel de conversa, contexto do checkout abandonado em cima (plano, valor, último link enviado), caixa de resposta
- Resposta enviada pela mesma edge `whatsapp-admin-reply`, parâmetro `account: 'recovery'` → usa `TWILIO_RECOVERY_ACCOUNT_SID` + `TWILIO_RECOVERY_AUTH_TOKEN` + `TWILIO_RECOVERY_FROM`. Só permite texto livre se janela 24h estiver aberta (último inbound < 24h); caso contrário, mostra aviso e bloqueia botão.

### 3. Botão "marcar como lido"

Atualiza `last_admin_read_at` na tabela de conversas (ou em tabela paralela `admin_inbox_read_state` para o caso oficial, para não mexer em profiles).

---

## Configuração manual necessária (você faz)

Depois do deploy preciso te passar a URL do `webhook-twilio-recovery` para você colar no console da **subaccount Twilio de recuperação** → Messaging → WhatsApp Sender → "When a message comes in".

---

## Técnico

**Migrações novas:**
- `recovery_conversations` (phone PK, last_inbound_at, last_outbound_at, last_admin_read_at, checkout_session_id nullable)
- `recovery_messages` (id, phone, direction, body, media_url, message_sid unique, created_at, sent_by_admin bool)
- `admin_inbox_read_state` (user_id PK, last_read_at) — para aba oficial
- RLS: SELECT/UPDATE só para admins (`has_role`); service_role full access
- Habilitar realtime nas duas novas tabelas

**Edge functions novas:**
- `webhook-twilio-recovery` (sem JWT) — parser igual ao `webhook-twilio`, mas grava em `recovery_messages` e atualiza `recovery_conversations`. Não chama `process-webhook-message`.
- `whatsapp-admin-reply` (com JWT, valida admin role) — body `{ account: 'official'|'recovery', phone, text }`. Envia via Twilio Gateway na subaccount correta, grava outbound na tabela apropriada.

**Edge functions modificadas:**
- `recover-abandoned-checkout-whatsapp` → após cada envio bem-sucedido, insere row em `recovery_messages` (direction=out, sent_by_admin=false) e upsert em `recovery_conversations`.

**Frontend:**
- Nova rota `/admin/whatsapp-inbox` em `src/pages/AdminWhatsappInbox.tsx`
- Componentes: `<InboxList>`, `<ConversationView>`, `<ReplyBox>`, `<CheckoutContextCard>`
- Link no menu admin existente
- Subscription realtime nas duas tabelas

**Fora de escopo (não toco agora):**
- Não logo outbound de TODAS as funções que mandam pelo número oficial (são dezenas). A aba Oficial mostra `messages` que já é populada pelo `aura-agent`. Outbound do admin é gravado, mas outbound de templates proativos continua só nos logs.
- Sem suporte a envio de mídia pelo painel (só texto)
- Sem suporte a templates aprovados fora da janela 24h
