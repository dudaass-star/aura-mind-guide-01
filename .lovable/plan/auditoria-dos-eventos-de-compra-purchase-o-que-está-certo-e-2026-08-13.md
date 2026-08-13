# Auditoria dos eventos de compra (Purchase) — o que está certo e 3 furos

## Verificação feita agora
Consultei o `meta_capi_log` e li os 4 webhooks de pagamento.

**Funcionando:** os 4 trilhos disparam `Purchase` no Meta CAPI + conversão do ChatGPT Ads, com o mesmo `event_id` e dedupe antes de enviar.
- `stripe-webhook` (cartão), `webhook-woovi` (PIX Automático), `webhook-inter`, `webhook-asaas`.
- Últimos 10 disparos: **todos com status 200** no Meta, e-mail e telefone sempre presentes, `fbp` presente em quase todos (o `fbc` falta em alguns — esperado quando o cookie do clique não sobrevive).
- Nenhum disparo em renovação: em todos os trilhos o Purchase está atrás do "primeiro pagamento".

## Furo 1 — Toda compra PIX é marcada como "1ª compra"
No Woovi e no Inter, o campo `is_first_purchase` está fixo em `true`. Quem já foi cliente (usou a semana e voltou) entra no Meta como aquisição nova, inflando o resultado das campanhas e sujando o sinal. A regra do projeto é: Purchase só como aquisição de cliente novo.
**Correção:** calcular novo vs. retornante (existência de perfil anterior / reativação), como o `stripe-webhook` e o `webhook-asaas` já fazem, e não disparar quando for retorno.

## Furo 2 — Painel do funil não recebe a compra do PIX Inter/Asaas
O passo `purchase_confirmed` (linha de chegada gravada pelo servidor) só existe no `stripe-webhook` e no `webhook-woovi`. Pagamento confirmado pelo Inter ou pelo Asaas não aparece como compra no painel de funil.
**Correção:** gravar `purchase_confirmed` também nesses dois webhooks, com plano, ciclo e método.

## Furo 3 — GA4 só recebe compra do cartão
O `purchase` do GA4 (Measurement Protocol) só sai no `stripe-webhook`. Vendas por PIX não chegam ao GA4.
**Correção:** enviar o mesmo `purchase` do GA4 nos webhooks de PIX, reusando o `event_id` como `transaction_id`.

## Ponto de atenção (sem mudança proposta)
O valor enviado no Purchase da 1ª compra é o da entrada (R$ 6,90), não o valor do plano. Isso é coerente entre cartão e PIX e reflete a receita real do momento — mantenho assim, a não ser que você prefira otimizar as campanhas pelo valor do plano.

## Detalhes técnicos
- `supabase/functions/webhook-woovi/index.ts` e `webhook-inter/index.ts`: cálculo real de `isFirstPurchase` + `purchase_confirmed` em `checkout_funnel_events`.
- `supabase/functions/webhook-asaas/index.ts`: `purchase_confirmed` no funil.
- Envio do GA4 extraído para helper compartilhado (`_shared`) e chamado nos trilhos PIX.
- Tudo em bloco isolado: falha de tracking nunca bloqueia a ativação da assinatura.
