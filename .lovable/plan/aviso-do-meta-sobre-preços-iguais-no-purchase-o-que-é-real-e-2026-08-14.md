# Aviso do Meta sobre "preços iguais" no Purchase: o que é real e o que fazer

## Diagnóstico (verificado nos logs)

O aviso não indica bug de código. O valor enviado é dinâmico e vem do pagamento real — os `Purchase` enviados ao Meta têm valores diferentes ao longo do tempo (6,90 · 9,90 · 19,90 · 29,90 · 49,90).

O que dispara o alerta é o funil atual: desde que a entrada passou a ser sempre a 1ª semana por R$ 6,90 (cartão e PIX), quase todo `Purchase` recente sai com **value = 6,90**. Nos últimos dias: 6,90 (Woovi), 6,90 (Woovi), 9,90, 6,90 (Inter x2), 6,90 (Stripe). O Meta lê isso como "todos os eventos com o mesmo preço".

E ele está certo num ponto: **o ROAS hoje é calculado sobre R$ 6,90**, subestimando a receita real. A conversão que importa comercialmente (cobrança cheia no 8º dia) não envia nenhum evento ao Meta hoje — nem no cartão (`invoice.paid`), nem no PIX recorrente.

## Isso afeta o desempenho da campanha?

Não a entrega. O aviso afeta só o **cálculo de valor/ROAS** do Meta. Para o objetivo de **CAC mais baixo**, o alvo de otimização deve continuar sendo o `Purchase` de R$ 6,90: é o evento mais frequente e barato, então o algoritmo sai do aprendizado rápido e o CAC cai. Otimizar pela cobrança cheia (8º dia) atrasaria o sinal em 8 dias e reduziria o volume — bom para ROAS, ruim para CAC.

Portanto o evento novo entra como **medição**, não como alvo de campanha.

## O que fazer

1. **Manter o `Purchase` da entrada em 6,90** (é a compra que de fato aconteceu; alterar isso vira dado inflado).
2. **Criar um evento de conversão de assinatura na 1ª cobrança cheia** (8º dia), com o valor real do ciclo (29,90 / 59,70 / 118,80 etc.). Serve para ler receita real e LTV por campanha — **sem trocar o alvo de otimização**, que segue no `Purchase`.
3. Enviar o mesmo evento para ChatGPT Ads e GA4, mantendo a paridade já existente.
4. Mostrar o evento novo no painel do funil (quantas entradas de 6,90 viraram cobrança cheia).

Com isso o Meta passa a ver dois preços distintos por jornada, o aviso deixa de fazer sentido e a entrega das campanhas continua intacta.

## Detalhes técnicos

- Novo evento padrão Meta `Subscribe`, dedupe por `event_id` em `meta_capi_log` (mesmo padrão do `Purchase`), `value` = valor cobrado, `currency: BRL`.
- Pontos de disparo:
  - `stripe-webhook` → `invoice.paid` quando não é a fatura do trial (`billing_reason = subscription_cycle`), 1ª ocorrência por assinatura.
  - `webhook-woovi` → cobrança de ciclo paga (não a entrada), reaproveitando a detecção de renovação existente.
  - `webhook-inter` e `webhook-asaas` → mesma regra nos ciclos.
- Reuso de `_shared/meta-identity.ts` (fbp/fbc), `_shared/openai-capi.ts` e `_shared/ga4-purchase.ts` (com nome de evento parametrizável).
- `CheckoutFunnelPanel.tsx`: linha "conversão de assinatura (8º dia)" lida de `meta_capi_log`.
- Nada muda no `Purchase` atual nem na regra "Purchase só na 1ª compra".