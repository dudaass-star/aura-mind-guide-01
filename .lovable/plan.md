

# Templates Faltantes no Twilio

## Análise

Comparando os 7 templates criados com todos os cenários de envio proativo no sistema:

### Templates que existem (7):
`checkin`, `content`, `weekly_report`, `insight`, `session_reminder`, `reactivation`, `checkout_recovery`

### Templates que faltam:

| # | Categoria | Cenário | Função que usa |
|---|-----------|---------|----------------|
| 1 | **welcome** | Saudação ao novo assinante (3 variantes: novo, upgrade, retorno) | `stripe-webhook` |
| 2 | **welcome_trial** | Saudação quando inicia trial | `start-trial` |
| 3 | **reconnect** | Aviso de volta após erro/queda técnica | `instance-reconnect-notify` |
| 4 | **dunning** | Falha de pagamento com link para atualizar cartão | `stripe-webhook` + `reprocess-dunning` |
| 5 | **followup** | Follow-up de conversa diário | `scheduled-followup` |
| 6 | **access_blocked** | Mensagem de reativação quando usuário cancelado tenta falar | `webhook-zapi` (acesso bloqueado) |

## Plano de Implementação

### Passo 1: Migration — adicionar 6 novos templates
Inserir na tabela `whatsapp_templates` os 6 templates faltantes com `is_active = false` e `twilio_content_sid = 'PENDING_APPROVAL'`.

### Passo 2: Atualizar `TemplateCategory` type
Adicionar os novos tipos em `whatsapp-official.ts`.

### Passo 3: Atualizar `.lovable/plan.md`

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| Migration SQL | Novo — seed 6 templates |
| `_shared/whatsapp-official.ts` | Adicionar novos tipos ao `TemplateCategory` |

Depois de criar os templates no banco, você pode criar os Content Templates correspondentes no Twilio Console seguindo o mesmo processo já explicado.

