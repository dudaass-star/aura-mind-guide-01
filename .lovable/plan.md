# Varredura do pixel e eventos do Meta — o que está certo e os 5 furos encontrados

## O que já está saudável (verificado nos dados)

Últimos 7 dias no nosso log de eventos (`meta_capi_log`), **zero erros** de resposta do Meta:

| Evento | Enviados | com fbc | com fbp | com e-mail/telefone |
|---|---|---|---|---|
| PageView | 238 | 134 | 194 | — |
| ViewContent | 173 | 104 | 130 | — |
| InitiateCheckout | 29 | 25 | 29 | 29 |
| Lead | 29 | 25 | 29 | 29 |
| Purchase (Woovi) | 3 | 2 | 3 | 3 |
| Purchase (Inter) | 2 | 0 | 0 | 2 |

Pixel 939366085297921 inicializa em todas as rotas públicas, o `noscript` está no `<body>` (HTML válido), CAPI manda IP + user-agent reais, `action_source: website`, `event_id` compartilhado com o navegador (dedupe correto) e o trilho PIX está operacional agora (`healthy: true`).

## Furo 1 — O site publicado está atrasado em relação ao código (o mais importante)

Hoje às 16:21 ainda saíram **Lead e InitiateCheckout em par** (29 e 29, sempre aos pares). O código atual já dispara só `InitiateCheckout`; o único arquivo que ainda emite `Lead` é a página de checkout antiga, que hoje só existe como redirecionamento. Conclusão: o que está no ar é um build anterior às últimas correções — inclusive antes do `PageView` na raiz e do registro de `ad_landing` (só 1 registro até agora).

Ação: **publicar**. Sem publicar, nenhuma das melhorias de sinal chega ao Meta.

## Furo 2 — Código morto que pode ressuscitar a duplicação

`src/pages/Checkout.tsx` (rota desativada) ainda contém `Lead` + `InitiateCheckout` + CAPI. Vou remover o bloco de tracking dessa página para o `Lead` duplicado não voltar num futuro reuso.

## Furo 3 — ViewContent do checkout está "cego" e com valor que alimenta o alerta de preços

Na página de checkout o `ViewContent` é disparado direto no `fbq`, **sem `eventID` e sem CAPI** — então ele não é deduplicado nem sobrevive a bloqueador. Além disso ele manda `value: 6,90`, o mesmo valor da landing, reforçando o alerta "envie mais preços" do Meta.

Ação: passar esse disparo pelo helper único (`trackMetaViewContent`), com `event_id` + CAPI, e **tirar o `value` do ViewContent** (valor fica só em `InitiateCheckout`, `Purchase` e `Subscribe`, que é onde o Meta usa preço).

## Furo 4 — Purchase do trilho Inter sem atribuição nenhuma

Os 2 `Purchase` vindos do `webhook-inter` foram enviados **sem `fbp` e sem `fbc`** (0 de 2). Os trilhos Woovi e Asaas já usam o cache de identidade (`meta_identity_cache`); o Inter ficou de fora.

Ação: aplicar `resolveMetaIdentity` no `webhook-inter` (mesmo padrão dos outros), elevando a cobertura de `fbc` no Purchase.

## Furo 5 — Página de obrigado desliga a configuração automática do pixel

`ThankYou.tsx` chama `fbq('set','autoConfig','false')`. Isso foi feito para o Meta não inventar um Purchase pelo conteúdo da página, mas também **desliga a Correspondência Avançada Automática (AAM)** nessa página.

Ação: manter o objetivo (nada de Purchase automático) sem matar o AAM — remover o `autoConfig false` e garantir que a página não contenha padrão de valor/pedido que o Meta interprete como compra. O Purchase real continua vindo do servidor pelos webhooks.

## Otimizações que valem a pena (mesmo sem furo)

- **`test_event_code` opcional no CAPI**: permite validar eventos no "Testar eventos" do Meta sem sujar produção. Hoje não temos como testar sem gerar evento real.
- **Linha de qualidade no painel admin**: já existe o KPI de match do Purchase; vou somar a cobertura de `fbc` por evento (PageView/IC/Purchase) para enxergar queda de sinal no mesmo lugar.

## Detalhes técnicos

- `src/pages/CheckoutV2.tsx`: `ViewContent` via `trackMetaViewContent`, sem `value`.
- `src/pages/Checkout.tsx`: remover bloco de tracking Meta (Lead/IC/CAPI).
- `src/pages/ThankYou.tsx`: remover `autoConfig false`.
- `supabase/functions/webhook-inter/index.ts`: importar e usar `resolveMetaIdentity` antes do CAPI Purchase.
- `supabase/functions/meta-capi/index.ts`: aceitar `test_event_code` opcional no body.
- `src/components/admin/CheckoutFunnelPanel.tsx`: linhas de cobertura de `fbc` por evento.
- Nada muda em preço, cobrança, webhooks de pagamento ou nas regras de `Purchase`/`Subscribe`.

## Verificação após o deploy

Comparar por 24-48h: `PageView` com `fbc` (deve subir com o disparo na raiz), `ad_landing` × cliques do Ads Manager, e cobertura de `fbc` no Purchase do Inter na próxima venda desse trilho.
