

# Fase 1: Preparação para API Oficial do WhatsApp

## Resumo

Mudanças preparatórias que **não alteram** o comportamento atual. A Aura continua via Z-API até a flag `WHATSAPP_PROVIDER` ser mudada manualmente para `'official'`.

## Alterações

### 1. Migration: adicionar `last_user_message_at` na tabela `profiles`

```sql
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_user_message_at timestamptz;
```

### 2. Atualizar `webhook-zapi/index.ts`

Após a deduplicação bem-sucedida, adicionar update do campo `last_user_message_at` no profile do usuário (lookup por phone). Isso não interfere no fluxo existente — é apenas um `UPDATE` extra.

### 3. Criar `supabase/functions/_shared/whatsapp-official.ts`

Funções para a API oficial (usadas apenas no futuro):
- `isWithin24hWindow(lastUserMessageAt)` — verifica se janela está aberta
- `splitMessageForTemplate(text, prefixLength)` — divide msgs >980 chars
- `sendTemplateMessage(phone, templateName, variables, config)` — placeholder que retorna erro "not configured" por enquanto
- `sendProactiveMessage(phone, text, templateName, config)` — lógica de decisão janela aberta/fechada + split

Template mapping:
```typescript
const TEMPLATE_MAP = {
  followup: { name: 'aura_followup', prefix: 'Sua Aura 💜\n\n' },
  insight: { name: 'aura_insight', prefix: 'Insight da Aura ✨\n\n' },
  checkin: { name: 'aura_checkin', prefix: 'Seu check-in 🌿\n\n' },
  session_reminder: { name: 'aura_session_reminder', prefix: 'Lembrete de sessão 🕐\n\n' },
  weekly_report: { name: 'aura_weekly_report', prefix: 'Seu resumo semanal 📊\n\n' },
  content: { name: 'aura_content', prefix: 'Conteúdo da jornada 🌱\n\n' },
  reactivation: { name: 'aura_reactivation', prefix: 'Oi, sentimos sua falta 💜\n\n' },
  checkout_recovery: { name: 'aura_checkout_recovery', prefix: 'Seu acesso está esperando ✨\n\n' },
};
```

### 4. Criar `supabase/functions/_shared/whatsapp-provider.ts`

Camada de abstração:
- `getProvider()` — lê `system_config` key `whatsapp_provider`, default `'zapi'`
- `sendMessage(phone, text, templateName?, config?)` — se provider=zapi, chama `sendTextMessage` atual; se provider=official, chama `sendProactiveMessage`

### 5. Inserir config padrão

Inserir na `system_config`:
```sql
INSERT INTO system_config (key, value) 
VALUES ('whatsapp_provider', '"zapi"')
ON CONFLICT (key) DO NOTHING;
```

## Arquivos criados/modificados

| Arquivo | Ação |
|---------|------|
| Migration SQL | Novo — adiciona coluna `last_user_message_at` |
| `_shared/whatsapp-official.ts` | Novo |
| `_shared/whatsapp-provider.ts` | Novo |
| `webhook-zapi/index.ts` | Modificar — gravar `last_user_message_at` |

## Impacto no sistema atual

**Zero.** A flag `whatsapp_provider` default é `'zapi'`. Nenhuma função proativa é alterada nesta fase. As 13 funções proativas continuam chamando `sendTextMessage` diretamente até a Fase 3.

