## Objetivo
Alinhar `whatsapp_templates` com os 7 templates aprovados no novo número Meta (WABA `2153650951869969`), mantendo Twilio como fallback nos casos sem template Meta.

## Mudanças no banco (UPDATE em `whatsapp_templates`)

**Corrigir nomes Meta (4 linhas):**
| Categoria | meta_template_name antigo | novo |
|---|---|---|
| content | jornada_disponivel | `jornada_disponivel2` |
| session_reminder | aura_session_reminder_v2 | `sessao_inicio` |
| weekly_report | aura_weekly_report_v2 | `relatorio_semanal` |
| welcome | aura_welcome_v2 | `welcome` |

**Ajustar idioma (1 linha):**
- `weekly_question` → `meta_language_code = 'en'` (conteúdo continua PT-BR, só o rótulo do template é `en`)

**Limpar mapeamento Meta (3 linhas — sem template aprovado no Meta, ficam só via Twilio):**
- `checkout_recovery_wa_15min` → `meta_template_name = NULL`, `meta_language_code = NULL`
- `checkout_recovery_wa_24h` → idem
- `reconnect` → idem

**Mantidas como já estão:**
- `checkin` (`cheking_7dias`) ✅
- `monthly_letter` (`carta_mensal`) ✅

Twilio `twilio_content_sid` permanece intacto em todas as 10 linhas (fallback/reserva).

## Ajuste no provider (`supabase/functions/_shared/whatsapp-provider.ts`)
Garantir que, quando `whatsapp_provider = 'meta'` e a linha não tiver `meta_template_name`, o envio caia automaticamente no Twilio (fallback por categoria) em vez de falhar. Isso cobre os 3 templates de recovery + reconnect, que ainda só existem no Twilio.

## Ajuste cosmético no painel (`src/pages/AdminTemplates.tsx`)
Contador "Meta" passa a contar apenas linhas com `meta_template_name IS NOT NULL`. Resultado esperado: **7 Meta + 3 só Twilio**, batendo com o sync.

## Validação
1. Rodar UPDATEs.
2. Clicar "Sincronizar com Meta" no painel — confirmar 7 aprovados.
3. Conferir que painel mostra 7 com badge Meta e 3 só Twilio.
4. Teste com 1 usuário em `whatsapp_provider = 'meta'`: disparar um `checkin` (Meta) e um `reconnect` (deve cair pra Twilio via fallback).

## Memória a atualizar
- `mem://technical/whatsapp/approved-template-sids` → adicionar mapa Meta (7 templates) + nota de fallback Twilio para recovery/reconnect.
