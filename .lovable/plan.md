# Diagnóstico do META_ACCESS_TOKEN

Hipótese: a migração do WhatsApp pra Meta Cloud API (criação de novo System User / novo app no Business Manager) pode ter invalidado o token de Ads usado pelo `meta-capi`. Vamos confirmar antes de pedir token novo.

## Passos

1. **Criar edge function `meta-capi-debug`** (one-shot, descartável):
   - Protegida por header `x-internal-secret` (INTERNAL_WEBHOOK_SECRET).
   - Chama `GET https://graph.facebook.com/v21.0/debug_token?input_token=${META_ACCESS_TOKEN}&access_token=${META_ACCESS_TOKEN}`.
   - Retorna JSON cru da Meta: `app_id`, `type` (USER / SYSTEM_USER / PAGE), `application` (nome do app dono), `expires_at`, `data_access_expires_at`, `is_valid`, `scopes`, `error` se houver.
   - Também roda um `GET /me?access_token=...` pra mostrar quem é o ator do token.
   - Compara com `META_WHATSAPP_ACCESS_TOKEN` (mesma chamada) só pra ver se os dois tokens vieram do mesmo app/System User — se sim, é forte indício que foi sobrescrita.

2. **Invocar a função** via `curl_edge_functions` e te trazer o output bruto.

3. **Interpretar e decidir**:
   - Se `is_valid: false` + `error.code: 190` → token revogado/expirado. Próximo passo: gerar novo System User Token com `ads_management` + `business_management` e usar `update_secret`.
   - Se `is_valid: true` mas `scopes` não contém `ads_management` → token foi sobrescrito com um de WhatsApp. Mesmo fix: gerar token correto.
   - Se `application` igual ao do WhatsApp → confirmação da hipótese de sobrescrita durante a migração.
   - Se `expires_at` no passado → era User Token de 60 dias, expirou. Recomendação: migrar pra System User Token (não expira).

4. **Documentar achado em memória** (`mem://marketing/meta-capi-token-incident`) pra não repetir.

5. **Limpar**: deletar a edge function `meta-capi-debug` depois do diagnóstico.

## Detalhes técnicos

- Função: `supabase/functions/meta-capi-debug/index.ts`, sem CORS browser (uso interno), `verify_jwt = false` (default Lovable), valida `x-internal-secret`.
- Nenhuma migration, nenhuma mudança em código de produção.
- Output devolvido só pra mim/você no chat; não loga token em lugar nenhum (só metadata: app_id, scopes, expires_at).

## Não inclui

- Atualizar o token (só depois do diagnóstico, se você confirmar).
- Rodar o backfill das compras (já temos `backfill-meta-purchase` pronta — roda após o fix do token).
