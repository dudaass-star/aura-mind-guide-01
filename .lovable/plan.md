## Contexto

- O cliente Meta direto (`meta-whatsapp-client.ts`) já existe e funciona — testes passaram.
- A tabela `whatsapp_templates` já tem as colunas `meta_template_name` + `meta_language_code` (hoje vazias).
- Hoje o provider é global: `system_config.whatsapp_provider = "official"` (Twilio). Para cutover gradual precisamos de override por usuário.
- Twilio fica vivo como fallback/reserva — nada é apagado.

## O que vamos construir

### 1. Feature flag por usuário (mantém Twilio como default)

- Adicionar coluna `profiles.whatsapp_provider text` (nullable). Valores: `null` (segue global) | `"meta"` | `"official"` | `"zapi"`.
- Em `_shared/whatsapp-provider.ts`, mudar `getProvider()` para aceitar `userId?: string`:
  - Se `userId` informado e `profiles.whatsapp_provider` ≠ null → usa esse valor.
  - Senão → cai no `system_config.whatsapp_provider` (lógica atual).
- Propagar `userId` em `sendMessage` / `sendProactive` / `sendAudio` / `sendAudioUrl` (todos já recebem userId em vários callers; onde não recebem, fica no default global).
- Global continua `"official"` (Twilio). Você liga Meta um usuário por vez.

### 2. Sincronizador de templates Meta → DB

Nova edge function `meta-templates-sync` (admin-only, verify_jwt em código):
- Lê `WABA_ID` (novo secret) e usa `META_WHATSAPP_ACCESS_TOKEN`.
- Chama `GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates?fields=name,language,status,category,components&limit=200` (com paginação).
- Filtra `status = "APPROVED"`.
- Retorna JSON com a lista: `{ name, language, category, body_text, button_labels[], variables_count }`.
- **Não escreve** automaticamente — você decide o mapeamento (já que `whatsapp_templates.category` é semântica nossa: `checkin`, `weekly_question`, `session_reminder`, etc.).

### 3. UI admin pra mapear templates Meta

Em `src/pages/AdminTemplates.tsx`:
- Botão "Sincronizar com Meta" → chama `meta-templates-sync`, abre dialog com a lista de templates aprovados (nome, idioma, categoria, preview do corpo).
- Em cada linha da tabela atual, adicionar duas colunas editáveis: **Meta Template Name** + **Meta Language Code** (hoje só dá pra editar Twilio ContentSid).
- Salvar via `admin-update-template` (estender allowlist pra incluir `meta_template_name` e `meta_language_code`).
- Coluna nova "Provider Override por Usuário" não — isso fica fora dessa tela; vai numa coluna nova em `AdminUsers.tsx` (dropdown Default / Meta / Twilio) na linha 4.

### 4. Override por usuário na tela Admin Users

- Em `src/pages/AdminUsers.tsx`, adicionar dropdown "Canal WhatsApp" por usuário (Default | Meta | Twilio | Z-API).
- Persistir via `admin-update-profile` (já existe; estender allowlist com `whatsapp_provider`).

### 5. Secret novo

Você precisa me passar o **WhatsApp Business Account ID (WABA ID)** do número +1 555-959-6770. Encontra em:
- Meta Business Suite → Configurações → Contas → Contas do WhatsApp → ID da conta (número de 15-16 dígitos)
- Ou Meta App Dashboard → WhatsApp → API Setup → "WhatsApp Business Account ID"

Eu cadastro como secret `META_WHATSAPP_BUSINESS_ACCOUNT_ID`.

Pergunta: o `META_WHATSAPP_ACCESS_TOKEN` e `META_WHATSAPP_PHONE_NUMBER_ID` que já estão nos secrets **são do número novo +1 555-959-6770** (que você testou e funciona), correto? Se sim, reaproveitamos. Se forem de outro número, me avisa pra trocar.

## Detalhes técnicos

```text
Fluxo de envio com flag por usuário:
  caller (ex: session-reminder)
    → sendProactive(phone, text, category, userId)
      → getProvider(userId)
          ├─ profiles.whatsapp_provider = "meta"  → metaSendProactiveMessage
          ├─ profiles.whatsapp_provider = null    → system_config.whatsapp_provider ("official") → Twilio
          └─ "zapi" → Z-API
```

Mapeamento de categorias → templates Meta (você confirma no dialog após sync):

```text
checkin                    → cheking_7dias (ou nome novo no Meta)
weekly_question            → pergunta_semanal
monthly_letter             → carta_mensal
session_reminder           → aura_session_reminder_v2
welcome                    → aura_welcome_v2
content                    → jornada_disponivel
weekly_report              → aura_weekly_report_v2
reconnect                  → aura_reconnect_v2
checkout_recovery_wa_15min → checkout_recovery_wa_15min
checkout_recovery_wa_24h   → checkout_recovery_wa_24h
```

Migration:
```sql
ALTER TABLE public.profiles ADD COLUMN whatsapp_provider text;
-- sem default, sem CHECK (validado no app); null = segue config global
```

Arquivos tocados:
- `supabase/migrations/<ts>_profile_whatsapp_provider.sql` (nova)
- `supabase/functions/meta-templates-sync/index.ts` (nova)
- `supabase/functions/_shared/whatsapp-provider.ts` (getProvider aceita userId)
- `supabase/functions/admin-update-template/index.ts` (allowlist + meta_template_name/meta_language_code)
- `supabase/functions/admin-update-profile/index.ts` (allowlist + whatsapp_provider)
- `src/pages/AdminTemplates.tsx` (botão sync + dialog + colunas Meta editáveis)
- `src/pages/AdminUsers.tsx` (dropdown canal WhatsApp por usuário)

## Fora de escopo

- Migrar webhook de inbound do Twilio pro Meta (Meta webhook já existe latente — `webhook-meta`). Quem usa o número novo já vai entrar por lá automaticamente porque a Meta dispara pro webhook do app dela. Mas confirma comigo se quer que eu valide isso também.
- Desligar Twilio. Continua ativo como reserva, exatamente como você pediu.

## Próximo passo antes de implementar

Me confirme:
1. O **WABA ID** do número novo (vou pedir o secret).
2. Se os secrets `META_WHATSAPP_ACCESS_TOKEN` / `META_WHATSAPP_PHONE_NUMBER_ID` atuais já são do número novo.
