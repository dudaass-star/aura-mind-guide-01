

# Fase 2: Twilio WhatsApp API — Plano de Implementação

## Visão geral

Substituir todos os placeholders por chamadas reais ao Twilio via Connector Gateway. Provider continua `'zapi'` por default — zero impacto no sistema atual.

## Passo 1: Solicitar secret `TWILIO_WHATSAPP_FROM`

Usar `add_secret` para pedir o número WhatsApp Business do Twilio no formato `whatsapp:+5511999999999`.

## Passo 2: Migration — tabela `whatsapp_templates`

```sql
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  twilio_content_sid text NOT NULL DEFAULT 'PENDING_APPROVAL',
  template_name text NOT NULL,
  prefix text NOT NULL,
  meta_category text NOT NULL DEFAULT 'utility',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.whatsapp_templates
  FOR ALL USING (auth.role() = 'service_role'::text);
CREATE POLICY "Admins can read" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed 7 templates (is_active = false until Content SIDs are set)
INSERT INTO public.whatsapp_templates (category, template_name, prefix, meta_category) VALUES
  ('checkin','aura_checkin','Seu check-in 🌿\n\n','utility'),
  ('content','aura_content','Conteúdo da jornada 🌱\n\n','utility'),
  ('weekly_report','aura_weekly_report','Seu resumo semanal 📊\n\n','utility'),
  ('insight','aura_insight','Insight da Aura ✨\n\n','utility'),
  ('session_reminder','aura_session_reminder','Lembrete de sessão 🕐\n\n','utility'),
  ('reactivation','aura_reactivation','Oi, sentimos sua falta 💜\n\n','marketing'),
  ('checkout_recovery','aura_checkout_recovery','Seu acesso está esperando ✨\n\n','marketing');
```

## Passo 3: Atualizar `whatsapp-official.ts`

Remover import de `zapi-client.ts`. Implementar 3 funções reais:

**a) `sendFreeText(phone, text)`** — Nova função, texto livre via Twilio Gateway:
- `POST /Messages.json` com `Body`, `To: whatsapp:+55...`, `From: env.TWILIO_WHATSAPP_FROM`
- Content-Type: `application/x-www-form-urlencoded` (URLSearchParams)
- Consumir response body com `await response.json()`

**b) `sendTemplateMessage(phone, templateName, variables)`** — Substituir placeholder:
- Buscar `twilio_content_sid` da tabela `whatsapp_templates` pelo `templateName`
- Se `is_active = false` ou SID = `PENDING_APPROVAL`, retornar erro
- `POST /Messages.json` com `ContentSid` + `ContentVariables: {"1": variables[0]}`
- Consumir response body

**c) `sendProactiveMessage`** — Atualizar lógica:
- Janela aberta → `sendFreeText(phone, text)` (em vez do placeholder)
- Janela fechada → `sendTemplateMessage` (parte 1) + `sendFreeText` (partes 2+)

## Passo 4: Atualizar `whatsapp-provider.ts`

Importar `sendFreeText` de `whatsapp-official.ts`. Substituir os 3 placeholders:

| Função | Branch `'official'` |
|---|---|
| `sendMessage` | `sendFreeText(phone, text)` |
| `sendAudio` | Log warning + return error (base64 não suportado na API oficial) |
| `sendAudioUrl` | `POST /Messages.json` com `MediaUrl` via Twilio Gateway |

## Passo 5: Atualizar `.lovable/plan.md`

Marcar Fase 2 como completa.

## Arquivos modificados

| Arquivo | Tipo |
|---|---|
| Migration SQL | Novo |
| `_shared/whatsapp-official.ts` | Edição |
| `_shared/whatsapp-provider.ts` | Edição |
| `.lovable/plan.md` | Edição |

## Segurança

- Tabela `whatsapp_templates` protegida por RLS (service_role + admins read)
- Secrets `LOVABLE_API_KEY` e `TWILIO_API_KEY` validados antes de cada chamada
- `TWILIO_WHATSAPP_FROM` validado no runtime
- Todos os response bodies consumidos (regra Deno)

