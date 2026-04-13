

# Renovação Automática do META_ACCESS_TOKEN

## Contexto

O Meta Access Token de longa duração dura 60 dias. Precisamos:
1. Gerar o token de longa duração a partir do token atual (curta duração)
2. Criar uma edge function que renove automaticamente o token antes de expirar
3. Armazenar o token renovado como secret

## Passo a Passo para Gerar o Token de Longa Duração

Antes de implementar, voce precisa fazer isso manualmente UMA VEZ:

1. No **Meta Developers** → Tools → **Graph API Explorer**
2. Selecione seu app e gere um **User Access Token** com as permissões: `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`, `pages_messaging`
3. Vá em **Meta Developers** → Tools → **Access Token Debugger** e verifique se o token é de curta duração
4. Troque por token de longa duração com este request (pode fazer no navegador):

```
https://graph.facebook.com/v21.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id={APP_ID}&
  client_secret={APP_SECRET}&
  fb_exchange_token={TOKEN_CURTA_DURACAO}
```

5. Copie o `access_token` retornado — esse é o token de 60 dias
6. Atualize o secret `META_ACCESS_TOKEN` com esse novo valor

## Implementacao — Edge Function de Renovacao Automatica

### 1. Criar `supabase/functions/refresh-meta-token/index.ts`

- Chama `GET https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token={TOKEN_ATUAL}`
- Se o Meta retornar um novo token, atualiza o secret via Supabase Management API
- Como a Management API nao esta disponivel em runtime, a alternativa e armazenar o token na tabela `instagram_config` (campo `access_token`) e usar esse campo em vez do env var
- Loga sucesso/erro

### 2. Alterar `instagram_config` para armazenar o token

- Adicionar coluna `meta_access_token TEXT` e `token_expires_at TIMESTAMPTZ` na tabela `instagram_config`
- As edge functions `instagram-agent` e `meta-capi` passam a ler o token da tabela primeiro, com fallback para o env var

### 3. Atualizar `instagram-agent/index.ts` e `webhook-instagram/index.ts`

- Ler `meta_access_token` da config da tabela antes de usar `Deno.env.get("META_ACCESS_TOKEN")`

### 4. Configurar CRON

- Agendar `refresh-meta-token` para rodar a cada 50 dias (antes de expirar)
- Alternativa: rodar diariamente e só renovar quando `token_expires_at` estiver a menos de 7 dias

### 5. Secrets necessarios

- `INSTAGRAM_APP_ID` — ID do app Meta (precisa ser adicionado)
- `INSTAGRAM_APP_SECRET` — ja existe

## Detalhes Tecnicos

- 1 nova edge function: `refresh-meta-token`
- 1 migracao: adicionar `meta_access_token` e `token_expires_at` na `instagram_config`
- 2 edge functions modificadas: `instagram-agent`, `webhook-instagram` (ler token da tabela)
- 1 novo secret: `INSTAGRAM_APP_ID`
- Config.toml: adicionar `[functions.refresh-meta-token]` com `verify_jwt = false`

