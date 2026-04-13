

## Plano: Corrigir envio de DMs no Instagram

### Problema
O token está correto no banco (verificado nos logs), mas o envio falha com "Cannot parse access token". A causa raiz é que o código usa o endpoint errado:
- **Atual**: `https://graph.instagram.com/v21.0/${igAccountId}/messages`
- **Correto**: `https://graph.facebook.com/v21.0/${pageId}/messages`

O Instagram Messaging API opera via Facebook Graph API, usando o **Page ID** (ID da página do Facebook), não o IG Account ID. O OAuth callback salva o `ig_account_id` mas não salva o `page_id`.

### Passos

1. **Adicionar coluna `page_id` na tabela `instagram_config`**
   - Migration: `ALTER TABLE instagram_config ADD COLUMN page_id text;`

2. **Atualizar `meta-oauth-callback/index.ts`**
   - Salvar `selectedPage.id` como `page_id` no banco junto com os outros dados

3. **Atualizar `instagram-agent/index.ts`**
   - Mudar endpoint de DM de `graph.instagram.com/v21.0/${igAccountId}/messages` para `graph.facebook.com/v21.0/${pageId}/messages`
   - Ler `page_id` do config passado pelo webhook
   - Adicionar log do URL completo para debug

4. **Re-deploy** ambas as funções e solicitar novo teste

### Detalhes técnicos
- Arquivos modificados: `meta-oauth-callback/index.ts`, `instagram-agent/index.ts`
- Migration SQL para adicionar coluna
- Após deploy, será necessário **reconectar o Instagram** pelo painel admin para popular o novo `page_id`

