

# Idempotência no Stripe Webhook

## Problema
Se o Stripe reenviar um evento (retry automático ou manual no dashboard), o webhook envia mensagens duplicadas ao cliente porque não verifica se o evento já foi processado.

## Solução
Usar o `event.id` do Stripe como chave de deduplicação. Já existe a tabela `zapi_message_dedup` no projeto — mas ela é específica para mensagens Z-API. Vamos criar uma tabela dedicada `stripe_webhook_events` para registrar eventos processados.

## Implementação

### 1. Migration: criar tabela `stripe_webhook_events`
```sql
CREATE TABLE public.stripe_webhook_events (
  id text PRIMARY KEY,              -- event.id do Stripe (evt_xxx)
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.stripe_webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-cleanup: apagar eventos com mais de 30 dias (opcional, via cron)
```

### 2. Editar `supabase/functions/stripe-webhook/index.ts`
Logo após verificar a assinatura e obter o `event`, antes de processar qualquer tipo de evento:

1. Criar o client Supabase (mover para cima)
2. Tentar inserir `event.id` na tabela `stripe_webhook_events`
3. Se o insert falhar com conflito (evento já existe) → retornar 200 sem processar
4. Se o insert der certo → continuar normalmente

Trecho adicionado (após linha 67):
```typescript
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Idempotency check
const { error: dedupError } = await supabase
  .from('stripe_webhook_events')
  .insert({ id: event.id, event_type: event.type });

if (dedupError?.code === '23505') {
  console.log(`⚠️ Event ${event.id} already processed, skipping`);
  return new Response(JSON.stringify({ received: true, duplicate: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

E remover a criação duplicada de `supabase` client que ocorre mais abaixo (linhas 101, 346, 429), reutilizando a instância criada no topo.

## Arquivos afetados
- **Migration**: nova tabela `stripe_webhook_events`
- **Editar**: `supabase/functions/stripe-webhook/index.ts` — adicionar check de deduplicação e consolidar client Supabase

