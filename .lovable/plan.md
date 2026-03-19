

# Implementação: Webhook Split — Plano Final

Feedback incorporado: `EdgeRuntime.waitUntil` com fallback gracioso via try/catch.

## Etapas

### 1. Criar secret `INTERNAL_WEBHOOK_SECRET`
String aleatória dedicada para autenticação inter-function.

### 2. Criar `process-webhook-message/index.ts`
Mover ~90% da lógica atual do `webhook-zapi`:
- Audio transcription, user lookup, persist inbound, subscription check
- Interruption system, trial limits, session handlers
- `aura-agent` call, tag processing, bubble sending, followup update

Autenticação: `x-internal-secret` header vs `INTERNAL_WEBHOOK_SECRET`.

Try/catch global com contingência Z-API em caso de falha.

### 3. Simplificar `webhook-zapi/index.ts` (~80 linhas)
- CORS + auth + parse + early exits
- Dedup insert
- Fire-and-forget com fallback:

```typescript
const workerPromise = fetch(...).catch(err => 
  console.error('Worker trigger failed:', err)
);
try {
  (globalThis as any).EdgeRuntime.waitUntil(workerPromise);
} catch {
  console.log('waitUntil not available, using simple fire-and-forget');
}
return new Response(JSON.stringify({ status: 'accepted' }), { status: 200 });
```

### 4. Atualizar `config.toml`
```toml
[functions.process-webhook-message]
verify_jwt = false
```

### 5. Deploy + verificação nos logs

