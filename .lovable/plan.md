
## O que os dados já mostram

Olhei `checkout_sessions` dos últimos 45 dias. O corte é nítido **a partir de 18/05/2026**:

| Período | Iniciados | Completos | Conv |
|---|---|---|---|
| 06/04 → 17/05 | ~330 | ~120 | **~36% (com picos de 50-70%)** |
| 18/05 → 21/05 | 60 | 6 | **~10%** |

A queda atinge **todos os planos e billings**:
- Direção mensal: 41% → 10%
- Essencial mensal: 32% → 20%
- Transformação mensal: 36% → 0%

**Dois sinais importantes que já posso afirmar:**
1. **Não é bug na LP nem no `create-checkout`.** 100% dos cliques continuam gerando `stripe_session_id` com sucesso — todo mundo chega na página da Stripe.
2. **Não há erro técnico novo do nosso lado.** `recovery_last_error` está vazio nos abandonados, e `failed_message_log` não mostra pico.

Ou seja: as pessoas estão **chegando na página hospedada do Stripe Checkout e abandonando lá** (ou tendo cartão recusado).

## Hipóteses a testar

Como não é falha de código nosso, a investigação precisa cruzar 3 dimensões:

### H1. Algo mudou na conta Stripe em 17-18/05
- Stripe Link foi reativado? Radar ficou mais agressivo? 3DS forçando challenge demais?
- Verificar `payment_intents` com status `requires_payment_method` no período de queda e ler o `last_payment_error.decline_code` de cada um.
- Olhar logs do `stripe-webhook` (edge logs) procurando picos de `payment_intent.payment_failed`.

### H2. Mudou a fonte/qualidade do tráfego
- Coincidência temporal com uma nova campanha Meta/Google? Público novo, criativos novos?
- Cruzar com Meta Pixel/CAPI: aumentou volume mas caiu intenção de compra?
- Verificar se em 17/05 entrou novo criativo na campanha (você sabe disso melhor que o banco).

### H3. Mudou algo na LP /v2 ou no copy/preço
- Inspecionar git/Lovable history das páginas `/v2` e `/checkout` entre 15-18/05.
- Olhar `IndexV2.tsx`, `Checkout.tsx`, `ExitIntentPopup`, social proof — qualquer texto que crie expectativa de preço diferente do que aparece no Stripe.

### H4. Comportamento sazonal
- 18/05 caiu numa segunda-feira. Pode haver efeito "segunda pós-recebimento" + concorrência de fim-de-mês. Comparar com mesma janela de semanas anteriores pra descartar.

## Entregáveis da investigação

1. **Painel/relatório com 3 cortes** (não código novo, só queries):
   - Conversão diária últimos 60 dias com linha de tendência.
   - Decline codes Stripe agrupados por dia (Radar/3DS/insufficient_funds/etc).
   - Tempo médio entre `checkout_sessions.created_at` e abandono (quem nem tentou cartão vs. quem tentou e foi recusado).

2. **Diff visual da LP /v2 e do fluxo de checkout** entre 14/05 e 18/05 (via histórico do Lovable). Quero saber se algum deploy aconteceu nesse intervalo.

3. **Veredicto** com a causa mais provável e 1-2 ações corretivas específicas (ex.: reverter deploy X, desligar Stripe Link, pausar criativo Y, ajustar 3DS de `any` pra `automatic`).

## Detalhes técnicos

- Queries usadas: `checkout_sessions` agrupado por dia/plano/billing/payment_method/status; `failed_message_log` por dia.
- Stripe MCP: `list_payment_intents` + `fetch_stripe_resources` por ID pra extrair `last_payment_error.decline_code` dos PIs em `requires_payment_method` desde 18/05.
- Edge logs: `stripe-webhook` e `create-checkout` filtrados por janela 17-21/05 procurando erros novos ou aumento de `payment_failed`.
- Sem mudanças de schema, sem mudanças de código nessa fase — só leitura.

Se aprovar, eu rodo a investigação e te trago o veredicto com gráfico + recomendação.
