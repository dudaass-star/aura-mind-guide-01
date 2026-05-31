## Diagnóstico

Confirmado o bug. O funil "Pagaram Plano Semanal / Responderam / Converteram" e a métrica `trialRespondedCount` usam o campo `profiles.trial_conversations_count` para contar quem respondeu pelo menos uma mensagem.

**O contador só é incrementado quando `profile.status === 'trial'`** (em `supabase/functions/process-webhook-message/index.ts`, linha 940):

```ts
if (profile.status === 'trial' && inboundSaved) {
  await supabase.from('profiles')
    .update({ trial_conversations_count: (profile.trial_conversations_count || 0) + 1 })
    ...
}
```

**Problema com PIX**: `webhook-asaas` cria o profile já com `status: "active"` (PIX é pago à vista, não trial) e ainda assim seta `trial_started_at` e `plan` — então o usuário **entra no funil** (que filtra `trial_started_at NOT NULL` + `plan NOT NULL`), mas **nunca tem o contador incrementado**, porque o status nunca é `'trial'`.

Resultado visível no print: `Pagaram 1 / Responderam 0 / Converteram 1` — matematicamente impossível, e exatamente o sintoma que você descreveu.

O mesmo problema afeta:
- `trialRespondedCount` (período)
- `funnelResponded` (all-time)
- `avgMsgsConverted` / `avgMsgsNonConverted` (PIX puxa as médias pra baixo)

Observação: o nome do funil ("Pagaram Plano Semanal") é herdado da era trial-de-cartão. Como PIX também cai nele (por ter `trial_started_at` + `plan`), o label hoje está enganoso, mas isso é outra discussão — esta correção foca apenas em contar resposta corretamente.

## Correção

### 1. `supabase/functions/process-webhook-message/index.ts`
Trocar o gate por uma condição que inclua usuários PIX/ativos que entraram no funil:

```ts
// Antes
if (profile.status === 'trial' && inboundSaved) { ... }

// Depois
if (inboundSaved && profile.trial_started_at && ['trial', 'active'].includes(profile.status)) { ... }
```

Mantém o contador como "respondeu pelo menos N vezes desde a entrada no funil" — válido tanto pra trial Stripe quanto pra ativo PIX. Custo: 1 update extra por mensagem inbound de ativo (negligível).

### 2. Backfill único dos PIX já existentes
Edge function temporária `backfill-trial-conversations-count` (ou um script SQL via migration) que, pra cada profile com `trial_started_at NOT NULL` e `trial_conversations_count = 0`, conta `SELECT count(*) FROM messages WHERE user_id = X AND role = 'user'` e grava o valor real. Roda 1x e descarta. Isso conserta o histórico do print atual sem esperar nova mensagem.

### 3. Sem mudança no frontend nem no `admin-engagement-metrics`
A lógica de leitura continua igual; só passa a refletir a realidade.

## Fora de escopo

- Renomear "Pagaram Plano Semanal" para algo que englobe PIX (pode virar follow-up se quiser).
- Mexer em outras métricas (MRR, churn, activation).

Aprova que eu sigo com a correção + backfill?
