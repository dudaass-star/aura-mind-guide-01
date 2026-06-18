## Estado atual (verificado em `meta_capi_log`)

**Pós-troca do token (17/06 17:30 UTC):**
- ✅ 2× `Purchase` enviados com `meta_status: 200` (backfill — camilamuri + fermaion, R$ 9,90 cada, com email/phone/fbp/fbc)
- ❌ 2× `Purchase` 400 anteriores (eram do backfill rodado ANTES do `instagram_config.meta_access_token` ser zerado — token velho ainda em cache no DB)
- ⚠️ Nenhum evento orgânico (`Lead`, `InitiateCheckout`, `Purchase` de webhook) desde a troca — não dá pra afirmar que o fluxo "ao vivo" está OK, só que o token funciona

Os últimos `Lead`/`InitiateCheckout` no log são de 17/06 02:25–02:34 UTC, todos com erro 190/460 (token velho). Depois disso, ninguém abriu checkout — então o silêncio é normal, mas precisa de uma validação ativa antes de declarar "tudo certo".

## Plano de verificação

### 1. Smoke test do token via `meta-capi-debug`
Disparar um `Purchase` de teste (com `event_id` único + flag de test event) pra confirmar que:
- Token novo é lido (do DB ou env)
- `ads_management` está ativo (sem erro 200/100 de permissão)
- Pixel `939366085297921` aceita o evento

### 2. Confirmar leitura do token na função
Conferir no log da chamada se a função pegou o token do env (já que zeramos `instagram_config.meta_access_token`). Garantir que `META_ACCESS_TOKEN` em Secrets bate com o token novo.

### 3. Checar Events Manager (manual, usuário)
Pedir pro usuário abrir Events Manager → Pixel Ola Aura → **Visão Geral** e **Eventos de teste**, confirmando:
- Os 2 `Purchase` do backfill apareceram (camilamuri + fermaion, R$ 9,90)
- `fbtrace_id` `AehR-qvYHv1msazhWKnYChZ` e `ASjYC4iRzASGMHP84uJRASA` aparecem em "Atividade"
- Qualidade da correspondência subiu (email + phone + fbp + fbc hasheados)

### 4. Próximo Purchase orgânico
Quando entrar a próxima compra de novo cliente (Stripe `checkout.session.completed` ou Asaas `PAYMENT_RECEIVED` com `isNew=true`), validar no `meta_capi_log`:
```sql
SELECT created_at, source, meta_status, meta_fbtrace_id, meta_error
FROM meta_capi_log
WHERE event_name='Purchase' AND source != 'backfill-manual'
ORDER BY created_at DESC LIMIT 5;
```
Critério: `meta_status=200`, `meta_error IS NULL`, `is_first_purchase=true`.

### 5. Limpeza (após validação)
- Remover `supabase/functions/meta-capi-debug` e `supabase/functions/backfill-meta-purchase` (deixar repo limpo)
- Ou manter como "kit de diagnóstico" se você preferir

## Pergunta antes de implementar
Quer que eu já rode o smoke test (passo 1) agora via `meta-capi-debug` enviando um `Purchase` de teste, ou prefere esperar a próxima compra orgânica entrar pra validar de verdade?