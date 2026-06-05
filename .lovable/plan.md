## Próximos passos pra ativar os templates do número novo

### 1. Cadastrar o WABA ID como secret
Adicionar `META_WHATSAPP_BUSINESS_ACCOUNT_ID = 2153650951869969` nos secrets da Lovable Cloud. A função `meta-templates-sync` já está pronta esperando esse secret.

### 2. Rodar a sincronização (admin)
Em `/admin/templates`, clicar em **"Sincronizar com Meta"**. A função vai:
- Chamar `graph.facebook.com/v21.0/2153650951869969/message_templates`
- Filtrar só os com `status = APPROVED`
- Retornar lista com `name`, `language`, `category`, `body_text`, variáveis e botões

Nada é gravado automaticamente — você decide o mapeamento.

### 3. Mapear cada template Meta → categoria interna
Na tabela de templates do admin, preencher para cada linha (`checkin`, `weekly_report`, `content`, etc.):
- **Meta Template Name** (ex: `cheking_7dias`)
- **Meta Language Code** (ex: `pt_BR`)

Esses campos já existem na tabela `whatsapp_templates` e a UI de edição já aceita.

### 4. Testar com 1 usuário antes do rollout
Em `/admin/users`, abrir um perfil de teste (recomendo o seu próprio) e setar **Canal WhatsApp = Meta**. Disparar uma proativa (ex: weekly report) e validar:
- Janela 24h aberta → texto livre via Meta Cloud API
- Janela fechada → template aprovado pelo nome + idioma mapeado

Logs aparecem com prefixo `[Meta]` em `edge_function_logs`.

### 5. Rollout gradual
Conforme combinado (feature flag por usuário):
- Cohort 1: novos cadastros → `whatsapp_provider = 'meta'`
- Cohort 2: usuários ativos engajados
- Cohort 3: base toda
- Twilio fica como fallback global (`system_config.whatsapp_provider = 'official'`) — não vai ser desligado.

### O que preciso de você agora
Confirmar: **posso cadastrar o secret `META_WHATSAPP_BUSINESS_ACCOUNT_ID = 2153650951869969`?** Depois disso, é só você clicar em "Sincronizar com Meta" no admin e mandar print/lista dos nomes pra eu te ajudar com o mapeamento das categorias.
