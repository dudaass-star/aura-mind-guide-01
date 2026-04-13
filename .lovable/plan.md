

## Plano: Configurar 3 templates aprovados no Twilio

### Mapeamento

| Template Twilio | ContentSid | Categoria no sistema |
|---|---|---|
| `welcome3` | `HXa793bb4cd721c3849088189a669748ff` | `welcome` |
| `relatorio_semanal` | `HX607738eeadd6fc8008c5735bbf0457a1` | `weekly_report` |
| `sessao_inicio` | `HXd36142c0778b6b77d1d7d49d3c41b319` | `session_reminder` |

### Ações

1. **Atualizar `welcome`** (id: `714fd4f9-ffb1-4fca-a15e-607a8834b07d`):
   - ContentSid: `HXa5ef9baff62dd1648c8e37f0ca03b054` → `HXa793bb4cd721c3849088189a669748ff`
   - `is_active` já é `true`

2. **Atualizar `weekly_report`** (id: `9f513187-55cc-41b4-bd59-b234fd35ef48`):
   - ContentSid: `PENDING_APPROVAL` → `HX607738eeadd6fc8008c5735bbf0457a1`
   - `is_active`: `false` → `true`

3. **Atualizar `session_reminder`** (id: `5451a527-b91c-47d0-97f0-6f34208dde56`):
   - ContentSid: `PENDING_APPROVAL` → `HXd36142c0778b6b77d1d7d49d3c41b319`
   - `is_active`: `false` → `true`

### Após configuração
4. **Enviar welcome para Jenoelma** usando o novo template `welcome3` via `admin-send-message`

### Detalhes técnicos
- 3 UPDATEs na tabela `whatsapp_templates` via insert tool
- 1 chamada à Edge Function `admin-send-message` para enviar boas-vindas à Jenoelma

