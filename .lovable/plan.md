## Migração WhatsApp Twilio → Meta Cloud API (Estratégia A — paralelo, Twilio segue ativo)

Conforme combinado nas mensagens #7955–#7959: **Twilio continua 100% no ar** até validarmos o stack Meta. Construímos um cliente Meta novo em paralelo, com feature flag default `twilio`, e só viramos depois de testes manuais OK.

### Estado atual (auditado)

- `_shared/whatsapp-official.ts` → na verdade é Twilio (chama `connector-gateway.lovable.dev/twilio`).
- `_shared/whatsapp-provider.ts` → roteia entre `zapi` e `'official'` (=Twilio hoje) via `system_config.whatsapp_provider`.
- `webhook-meta/index.ts` → já existe, valida `META_WEBHOOK_VERIFY_TOKEN` e `X-Hub-Signature-256` com `INSTAGRAM_APP_SECRET`. Inbound pronto.
- `process-webhook-message/index.ts` → `transcribeAudio` só sabe baixar mídia via gateway Twilio.
- Secrets prontos: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WEBHOOK_VERIFY_TOKEN`.
- WABA: `2153650951869969` | número novo: `+1 555-959-6770` (App AURA `1491408882345218`).

### Fases 1 + 2 + 3 (agora, sem ativar nada)

**Fase 1 — Cliente Meta paralelo** (arquivo NOVO, não toca o Twilio):

`supabase/functions/_shared/meta-whatsapp-client.ts` — espelha a interface do `whatsapp-official.ts`:
- `sendFreeText(phone, text)` → `POST graph.facebook.com/v21.0/{META_WHATSAPP_PHONE_NUMBER_ID}/messages` com `{ messaging_product:"whatsapp", to, type:"text", text:{ body, preview_url:false } }`.
- `sendTemplateMessage(phone, templateName, languageCode, variables)` → `type:"template"` com `components:[{ type:"body", parameters: vars.map(v=>({type:"text",text:v})) }]`.
- `sendAudioFromUrl(phone, audioUrl)` → `type:"audio", audio:{ link: audioUrl }`.
- `sendTemplateOnly(phone, category, userId, vars)` e `sendProactiveMessage(...)` — mesma assinatura/regras (janela 24h, lookup em `whatsapp_templates`, mas lendo `template_name + language_code` no lugar do `twilio_content_sid`).
- Auth: `Authorization: Bearer ${META_WHATSAPP_ACCESS_TOKEN}`.
- Telefone: E.164 só dígitos (`5511...`), sem `whatsapp:` e sem `+`.
- Resposta: `messages[0].id` (wamid) → `messageId`.
- Reusa `PROACTIVE_TITLES`, `prefixWithTitle`, `isWithin24hWindow`, `splitMessageForTemplate` (importa do `whatsapp-official.ts` ou move pra um util compartilhado).

**Fase 2 — Coluna `meta_template_name` em `whatsapp_templates`** (migration):
- `ALTER TABLE whatsapp_templates ADD COLUMN meta_template_name text, ADD COLUMN meta_language_code text DEFAULT 'pt_BR';`
- Populo os 3 conhecidos: `cheking_7dias`, `jornada_disponivel`, `aura_weekly_report_v2` (mesmos nomes; aprovação Meta acontece pela sua mão no painel).
- `twilio_content_sid` continua intocado — Twilio segue lendo daí.

**Fase 3 — Roteamento via feature flag (default Twilio)**:
- Em `_shared/whatsapp-provider.ts` adiciono terceiro provider `'meta'`, lendo `system_config.whatsapp_provider`. Default permanece **`'official'` (Twilio)**.
- `system_config.whatsapp_provider` aceita: `'zapi' | 'official' | 'meta'`.
- Quando `'meta'`, despacha pras funções de `meta-whatsapp-client.ts`. Nada muda no comportamento de `'official'`.

**Fase 3.5 — Suporte a download de mídia Meta no `transcribeAudio`**:
- No `process-webhook-message/index.ts`, adicionar branch para prefixo `meta-media:<media_id>`:
  1. `GET graph.facebook.com/v21.0/{media_id}` com Bearer → retorna `{ url }` (URL assinada curta).
  2. `GET <url>` com mesmo Bearer → baixa o blob.
- Branch Twilio antigo permanece.

### Fase 4 — Testes manuais (você + eu, antes de virar a flag)

Com a flag ainda em `'official'`, posso testar o cliente Meta de forma isolada via uma função QA temporária (ou chamando direto via `curl_edge_functions`):
- Texto livre pro seu número.
- Áudio TTS (URL pública do nosso storage).
- Template `cheking_7dias` com variável `{{1}}`.
- Inbound: você manda mensagem pro `+1 555-959-6770` → confere `webhook-meta` recebendo e o worker processando.
- Webhook precisa estar configurado no app Meta AURA → `Callback URL: https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-meta` + verify token + subscribe em `messages`.

### Fase 5 — Cutover gradual (depois dos testes OK)

- Inverter flag: `UPDATE system_config SET value='meta' WHERE key='whatsapp_provider';`
- Twilio webhook fica ligado por 30 dias (rollback fácil).
- Monitorar `failed_message_log` e logs do `webhook-meta` por 48h.

### Fase 6 — Limpeza (>= 95% sucesso, ~2 semanas depois)

- Migrar `twilio-recovery-client.ts` (Dunning) → `meta-recovery-client.ts`. **Fora deste escopo agora.**
- Cancelar número Twilio `+1 662 525 5005` (você no painel Twilio).
- Manter código Twilio mais 30 dias antes de apagar.

### Fora de escopo nesta entrega

- Aura prompts, comportamento conversacional, Stripe, Asaas, Instagram, prompts de sessão.
- Migração do fluxo de Dunning/Recovery (fica no Twilio sub-account até Fase 6).
- Apagar `whatsapp-official.ts` ou qualquer função Twilio.
- Mudar default da flag pra `'meta'` (só depois dos testes manuais).

### Arquivos tocados nesta entrega (Fases 1–3.5)

- **Novo**: `supabase/functions/_shared/meta-whatsapp-client.ts`
- **Editado**: `supabase/functions/_shared/whatsapp-provider.ts` (adiciona branch `'meta'`)
- **Editado**: `supabase/functions/process-webhook-message/index.ts` (branch `meta-media:` no `transcribeAudio`)
- **Migration**: colunas `meta_template_name`, `meta_language_code` em `whatsapp_templates` + populate dos 3 templates conhecidos
- **Intocados**: `whatsapp-official.ts`, `webhook-twilio`, `webhook-twilio-recovery`, `twilio-recovery-client.ts`, todo o fluxo de Dunning.

### Riscos

- Templates `cheking_7dias`, `jornada_disponivel`, `aura_weekly_report_v2` precisam ser **recriados/aprovados na WABA nova** (`2153650951869969`) antes da Fase 5. Aprovação Meta leva 24–72h. (Você faz no painel.)
- System User Token "Never expires" só se foi gerado com essa opção. Se não foi, expira em 60 dias — endereçamos com `refresh-meta-token` adaptado depois.
- Webhook do app AURA precisa ser apontado pro `webhook-meta` antes da Fase 4. (Você faz.)

### Memórias a atualizar (após cutover, não agora)

- `mem://technical/whatsapp/integration-provider-status`
- `mem://technical/whatsapp/twilio-template-constraint` (passa a aceitar `meta_template_name` quando provider=meta)
