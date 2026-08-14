# Verificar as "10 visualizações da página de destino" do Meta

## O que os nossos dados mostram

Nos últimos 3 dias o nosso próprio log de eventos (`meta_capi_log`) registrou:

- 235 `PageView` e 170 `ViewContent` (fonte `browser_top_funnel`), todos com resposta 200 do Meta.
- 133 desses `PageView` chegaram com `fbc` (identificador de clique de anúncio) e 191 com `fbp`.

Ou seja: muito mais gente entrou no site do que as 10 visualizações que o painel da campanha mostra. O número do Meta está subnotificado, não é o tráfego que está baixo.

## Por que o Meta mostra tão pouco (hipóteses a confirmar)

1. "Visualizações da página de destino" é uma métrica que o Meta calcula **só a partir do pixel de navegador**, e só quando ele consegue casar o evento com o clique do anúncio. Nosso `PageView` sai também por servidor (CAPI) com o mesmo `event_id`, o que serve para conversão mas normalmente não alimenta essa métrica.
2. O `PageView` está **desligado na rota `/`** (a raiz redireciona para `/v2`). Se o anúncio aponta para `olaaura.com.br`, a primeira página que o visitante vê não dispara `PageView` de navegador; ele só sai depois do redirecionamento — e quem sai antes disso não é contado.
3. Bloqueadores/iOS derrubam parte dos eventos de navegador, o que sempre deixa a métrica do Meta abaixo do real.

Nenhuma dessas três está confirmada como a causa dominante hoje — o primeiro passo do plano é medir antes de mexer.

## Passo 1 — Medição própria de "entrou no site vindo do anúncio"

Criar um registro leve de chegada (na tabela de eventos de funil já existente, com um passo novo `ad_landing`) contendo: rota de entrada, presença de `fbclid` na URL, `utm_source/campaign`, e id de sessão anônima. Isso é feito no servidor a partir do evento que o site já envia, sem cookie novo e sem dado pessoal.

Com isso passamos a ter, por dia:
- cliques de anúncio que realmente carregaram a página (fbclid fresco na URL),
- quantos desses chegaram no `/v2` e quantos seguiram para o checkout.

Esse número é o que vale para comparar com os "cliques no link" do Meta — e é ele que vai provar se as 10 estão erradas.

## Passo 2 — Corrigir a subnotificação do Meta

- Disparar o `PageView` de navegador **também na raiz `/`**, antes do redirecionamento (mantendo dedupe por `event_id`, sem contar duas vezes).
- Enviar o `fbc` derivado do `fbclid` já na primeira chamada, sem esperar o cookie (hoje o envio é reagendado se nem `_fbp` nem `_fbc` existem, e visitas curtas se perdem).
- Manter o CAPI como reforço de conversão.

## Passo 3 — Painel

Adicionar no painel admin (funil de checkout) uma linha "Chegadas do anúncio (fbclid)" por dia, ao lado de `PageView` e início de checkout, para acompanhar sem depender do Meta.

## Detalhes técnicos

- `src/lib/meta-pixel.ts`: remover `/` de `NO_PAGEVIEW_ROUTES`; em `sendCapi`, derivar `fbc` do `fbclid` da URL quando o cookie ainda não existe, em vez de reagendar.
- `src/components/MetaRouteTracker.tsx`: registrar `ad_landing` em `checkout_funnel_events` na primeira carga quando houver `fbclid`/`utm_*`.
- `src/components/admin/CheckoutFunnelPanel.tsx`: nova linha com a contagem diária de `ad_landing`.
- Nada muda em cobrança, webhooks ou eventos de `Purchase`/`Subscribe`.

## O que não vamos mudar

O evento `Purchase` (R$ 6,90) e o `Subscribe` (ciclo cheio) continuam como estão — a correção aqui é só de medição de topo de funil.
