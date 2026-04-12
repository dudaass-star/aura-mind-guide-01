

## Plano: Automacao Instagram com IA Separada (Comentarios + DMs)

### Visao Geral

Criar uma IA "Gestora de Comunidade" separada da Aura que responde automaticamente a **comentarios** e **DMs** no Instagram. Usa a **Instagram Graph API** via webhooks do Meta, processados por edge functions no backend.

### Arquitetura

```text
Instagram (Comentario/DM)
        │
        ▼
  Meta Webhook POST
        │
        ▼
  webhook-instagram (edge function)
    ├── Valida assinatura Meta
    ├── Classifica: comentario vs DM
    └── Chama instagram-agent
              │
              ▼
        instagram-agent (edge function)
          ├── Carrega contexto (post, historico)
          ├── Chama Lovable AI (Gemini Flash)
          ├── Classifica sentimento (positivo/negativo/duvida)
          └── Responde via Instagram Graph API
                ├── Comentario → Reply no comentario
                └── DM → Envia mensagem direta
```

### Componentes

#### 1. Edge Function: `webhook-instagram`
- Recebe webhooks do Meta (GET para verificacao, POST para eventos)
- Valida a assinatura `X-Hub-Signature-256` com o App Secret
- Processa eventos: `comments` (novos comentarios) e `messages` (DMs)
- Encaminha para `instagram-agent` com payload normalizado

#### 2. Edge Function: `instagram-agent`
- IA separada com persona de "Gestora de Comunidade da Aura"
- **Para comentarios**: tom institucional, acolhedor, educativo. Responde criticas sobre IA com empatia. Responde elogios com gratidao. Responde duvidas com informacao + CTA para o WhatsApp
- **Para DMs**: tom mais pessoal, funciona como funil de conversao. Explica o que a Aura faz, convida para experimentar via WhatsApp
- Usa Lovable AI (Gemini Flash) para gerar respostas contextuais
- Regras de seguranca: nao responder a spam/bots, nao responder proprios comentarios, rate limit por usuario

#### 3. Tabela: `instagram_interactions`
- Registra todas as interacoes (comentarios respondidos, DMs)
- Campos: `id`, `ig_user_id`, `ig_username`, `interaction_type` (comment/dm), `original_text`, `response_text`, `post_id`, `comment_id`, `sentiment`, `created_at`
- RLS: service_role + admin read

#### 4. Tabela: `instagram_config`
- Configuracoes do bot: `ig_account_id`, `response_enabled`, `comment_keywords` (palavras que disparam resposta), `max_daily_responses`, `daily_count`, `last_reset_date`
- RLS: service_role + admin

#### 5. Painel Admin (`/admin/instagram`)
- Dashboard com metricas: respostas hoje, sentimento geral, interacoes por dia
- Toggle on/off para ativar/desativar respostas
- Lista de interacoes recentes com o texto original e resposta gerada
- Configuracao de palavras-chave e limites diarios

### Persona da IA (System Prompt)

**Para comentarios publicos:**
- Nunca mencionar que e IA
- Representar a "equipe Aura"
- Criticas sobre IA: reconhecer a preocupacao, explicar que a Aura e uma ferramenta complementar de autoconhecimento, nao substitui terapia
- Elogios: agradecer com genuinidade
- Duvidas: responder brevemente + "Quer saber mais? Chama a gente no WhatsApp"
- Maximo 2-3 frases por resposta

**Para DMs:**
- Tom acolhedor mas nao terapeutico
- Explicar o que a Aura oferece
- Direcionar para o WhatsApp como canal principal
- Pode ser um pouco mais longo (3-5 frases)

### Secrets Necessarios

| Secret | Descricao | Status |
|--------|-----------|--------|
| `META_ACCESS_TOKEN` | Token da pagina/app Meta | Ja existe |
| `INSTAGRAM_APP_SECRET` | App Secret para validar webhooks | Novo |
| `INSTAGRAM_ACCOUNT_ID` | ID da conta profissional do Instagram | Novo |

### Configuracao no Meta

O usuario precisara:
1. No Meta Business Suite, ir em **Configuracoes do App**
2. Adicionar o produto **Instagram** ao app existente (mesmo app do Pixel/CAPI)
3. Configurar o webhook URL: `https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/webhook-instagram`
4. Assinar os eventos: `comments`, `messages`, `messaging_postbacks`
5. Gerar token de pagina com permissoes `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging`

### Arquivos a Criar/Modificar

1. **Criar** `supabase/functions/webhook-instagram/index.ts` — receptor de webhooks
2. **Criar** `supabase/functions/instagram-agent/index.ts` — IA de resposta
3. **Criar** `src/pages/AdminInstagram.tsx` — painel admin
4. **Migracoes SQL** — tabelas `instagram_interactions` e `instagram_config`
5. **Atualizar** `supabase/config.toml` — adicionar as novas functions com `verify_jwt = false`
6. **Atualizar** `src/App.tsx` — rota `/admin/instagram`

### Ordem de Implementacao

1. Migracoes SQL (tabelas)
2. `webhook-instagram` (receptor + verificacao Meta)
3. `instagram-agent` (IA com Lovable AI)
4. Painel admin
5. Configuracao de secrets + instrucoes para setup no Meta

