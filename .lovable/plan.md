## Causa raiz
Após rotação dos JWT keys da Supabase, deploys parciais deixaram `aura-agent` com `SUPABASE_SERVICE_ROLE_KEY` antiga e `process-webhook-message` com a nova. O check `authHeader.includes(SERVICE_ROLE_KEY)` em `aura-agent` retorna 401 em todas as 3 tentativas, e nenhuma resposta chega ao usuário.

## Correções

### 1. Tornar a auth resiliente em `aura-agent` (fix definitivo)
**Arquivo**: `supabase/functions/aura-agent/index.ts` (linha ~4154-4163)

Trocar o check frágil baseado em `includes(SERVICE_ROLE_KEY)` por uma verificação robusta usando um **shared secret dedicado** (`INTERNAL_WEBHOOK_SECRET` — já existe nos secrets) OU validando contra **ambas** as chaves (publishable+secret) lidas das listas plurais. Abordagem escolhida: usar `INTERNAL_WEBHOOK_SECRET` como header `X-Internal-Auth`, com fallback para o check antigo:

```ts
const authHeader = req.headers.get('Authorization') || '';
const internalAuth = req.headers.get('X-Internal-Auth') || '';
const INTERNAL = Deno.env.get('INTERNAL_WEBHOOK_SECRET');
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const isInternalCall = INTERNAL && internalAuth === INTERNAL;
const isServiceRole = SR && authHeader.includes(SR);

if (!isInternalCall && !isServiceRole) {
  console.warn('🚫 Unauthorized request to aura-agent');
  return 401;
}
```

### 2. Atualizar chamador `process-webhook-message`
**Arquivo**: `supabase/functions/process-webhook-message/index.ts` (linha 1176, função `callAuraAgent`)

Adicionar header `X-Internal-Auth: ${INTERNAL_WEBHOOK_SECRET}` na chamada fetch ao `aura-agent`, mantendo `Authorization: Bearer ${SR}` por compatibilidade.

### 3. Forçar redeploy sincronizado
Edição mínima (comentário/versão) no `aura-agent` para garantir que o deploy injete a chave SR atualizada — mesmo que o fix #1 já blinde contra rotações futuras.

### 4. Pequena defesa em `cleanPhoneNumber` (bug isolado)
**Arquivo**: `supabase/functions/_shared/zapi-client.ts` (linha 42)

Retornar string vazia (ou throw com mensagem clara) se `phone` for undefined, evitando o TypeError visto em um webhook órfão hoje.

## Validação após deploy
1. `curl POST /aura-agent` sem auth → ainda 401 (esperado).
2. Enviar mensagem WhatsApp de teste e observar `process-webhook-message` logs: deve mostrar `🤖 Agent response:` ao invés de `Agent HTTP 401`.
3. Conferir mensagens da Beatriz (5511944774214): enviar uma resposta manual de retomada após o fix.

## Não está relacionado
Os fixes dos bugs 2/3/4 (títulos de templates) **não causaram** essa falha — apenas o redeploy de `process-webhook-message` para entregá-los expôs uma rotação de chave preexistente. Não há necessidade de rollback.
