## Contexto

O número Meta novo (WABA `META_WHATSAPP_BUSINESS_ACCOUNT_ID`) tem 5 templates aprovados, todos `Utilidade` com 1 variável posicional `{{}}`:

| Template aprovado | Idioma | Categoria interna |
|---|---|---|
| `relatorio_semanal` | pt_BR | `weekly_report` |
| `jornada_semanal`   | pt_BR | `content` |
| `sessao_inicio2`    | pt_BR | `session_reminder` |
| `welcome2`          | pt_BR | `welcome` |
| `carta_mensal`      | **en** | `monthly_letter` |

O sender (`meta-whatsapp-client.ts → sendTemplateMessage`) já lê `meta_template_name`, `meta_language_code` e `meta_variable_count` e monta o componente `body` com parâmetros posicionais — então **nenhuma mudança de código** é necessária. Só precisamos corrigir os mapeamentos no banco e validar.

`cheking_7dias` (categoria `checkin`) ainda será submetido — fica fora desse passo, mas vou desativar a linha pra falhar fechado (evita erro 132000 no novo número até subir).

## Mudanças

### 1. Migration: atualizar `whatsapp_templates`

```sql
update public.whatsapp_templates
   set meta_template_name = 'relatorio_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1
 where category = 'weekly_report';

update public.whatsapp_templates
   set meta_template_name = 'jornada_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1
 where category = 'content';

update public.whatsapp_templates
   set meta_template_name = 'sessao_inicio2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1
 where category = 'session_reminder';

update public.whatsapp_templates
   set meta_template_name = 'welcome2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1
 where category = 'welcome';

update public.whatsapp_templates
   set meta_template_name = 'carta_mensal',
       meta_language_code = 'en',
       meta_variable_count = 1
 where category = 'monthly_letter';

-- cheking_7dias ainda não aprovado no número novo → falha fechado
update public.whatsapp_templates
   set is_active = false
 where category = 'checkin';
```

### 2. Validação (sem código novo)

Pra cada categoria atualizada, disparar `test-meta-new-number` em modo `template` (whitelist Eduardo) e conferir o `wamid` retornado:

- `template: relatorio_semanal`, components `[{type:body, parameters:[{type:text, text:"Eduardo"}]}]`
- mesmo padrão pra `jornada_semanal`, `sessao_inicio2`, `welcome2`
- `carta_mensal` com `language: "en"`

Logs ficam em `failed_message_log` se houver erro 132000/132001.

### 3. Memória

Atualizar `mem://technical/whatsapp/approved-template-sids` com a nova lista do número novo (Meta names, não SIDs Twilio) e marcar `cheking_7dias` como pendente de aprovação.

## Fora de escopo

- Não mexer no sender Meta — já posicional.
- Não desativar Twilio — segue como fallback (memória `mem://technical/whatsapp/meta-twilio-fallback-broad`).
- Submeter `cheking_7dias` ao novo número — você faz no painel Meta; depois reativo a linha.
- Não trocar `whatsapp_provider` ainda — esse plano só prepara os templates pro switch.

## Riscos

- **Erro 132000** (variable mismatch): mitigado por `meta_variable_count = 1` casando exatamente com `{{}}` único do corpo.
- **`carta_mensal` em `en`**: confirmado pelo print que foi aprovado em English, então `meta_language_code = 'en'` é obrigatório — qualquer outro valor cai em 132001.
- **`checkin` desativado**: `sendProactiveMessage` falha fechado fora da janela 24h pra categoria `checkin` até `cheking_7dias` ser aprovado. Reativação 7d fica pausada nesse intervalo.
