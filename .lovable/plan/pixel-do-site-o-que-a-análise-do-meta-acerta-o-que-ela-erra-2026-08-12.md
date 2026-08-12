# Pixel do site: o que a análise do Meta acerta, o que ela erra, e o que corrigir

## Veredito rápido

O diagnóstico do Meta está **parcialmente certo**. Testei o site em produção agora:

- O pixel **939366085297921 inicializa corretamente** em `olaaura.com.br/v2` e o `PageView` é disparado (confirmado: `pixels: ['939366085297921']`, `pixelInitializationTime` presente). Então "pixel inativo / código ausente no cabeçalho" está **errado**.
- O ID que eles citam (`120250376256180004`) **não é um pixel** — é formato de objeto de anúncio (ad/adset). O pixel do site é outro. Vale confirmar no Gerenciador de Eventos qual dataset o conjunto está usando; se o anúncio estiver vinculado a um dataset diferente do instalado, o "0 visualizações" é real e explicado só por isso.
- Mas encontrei um **furo real e grave de atribuição**: quem chega em `olaaura.com.br/` (raiz) é redirecionado para `/v2` e **o redirecionamento apaga a query string** — o `fbclid` é perdido, o cookie `_fbc` nunca é criado e o `PageView` fica sem vínculo com o clique. Confirmado no teste: em `/?fbclid=...` o `_fbc` **não** é criado; em `/v2?fbclid=...` é criado. Se os anúncios apontam para a raiz do domínio, isso sozinho produz exatamente o quadro relatado: cliques altos e Landing Page Views ~0.

## Problemas confirmados no código

1. **Redirect raiz destrói parâmetros** — `<Route path="/" element={<Navigate to="/v2" replace />} />` não preserva `?fbclid`/`utm_*`.
2. **Lista fixa de rotas para o pixel** — `index.html` só dispara em caminhos exatos (`/`, `/v2`, `/checkout`, ...). Qualquer variação de URL de anúncio (barra final, `/v2/algo`, novas LPs) entra sem PageView.
3. **Nenhum PageView em navegação interna** — o app é SPA; ao ir de `/v2` para `/v2/checkout` o GA4 registra, o Meta não. O Meta enxerga apenas 1 pageview por sessão.
4. **`_fbc` não é persistido** — hoje o `fbclid` só é lido no momento do checkout; se o usuário navega, recarrega ou volta depois, o vínculo com o clique se perde.
5. **CAPI não cobre topo de funil** — hoje só Lead/InitiateCheckout/Purchase saem por servidor. PageView/ViewContent ficam 100% dependentes do navegador (adblock, iOS, ITP).
6. **HTML inválido** — o `<noscript><img></noscript>` do pixel está dentro do `<head>` (só metadados são válidos ali); deve ir para o `<body>`.

## O que vou implementar

**A. Consertar a atribuição (raiz do problema)**
- Redirect `/` → `/v2` preservando query string e hash.
- Trocar a lista fixa de rotas por uma regra invertida: carrega o pixel em tudo, **exceto** rotas privadas (`/admin/*`, `/meu-espaco/*`) — assim qualquer LP futura já vem instrumentada.
- Capturar `fbclid` na primeira visita e gravar `_fbc` em cookie de 1º nível (90 dias), no formato `fb.1.<timestamp>.<fbclid>`, para sobreviver a navegação e retorno.

**B. PageView em toda navegação SPA**
- Um `MetaRouteTracker` (espelho do `GA4RouteTracker`) dispara `PageView` a cada troca de rota, com `eventID` próprio para deduplicar com o servidor.

**C. CAPI de topo de funil (server-side)**
- Enviar `PageView` (e `ViewContent` da landing) também via `meta-capi`, com `event_id` idêntico ao do navegador, `fbp`, `fbc`, `event_source_url`, IP e user-agent. Dedupe garantido, cobertura mesmo com bloqueador.
- Aproveitar a função `meta-capi` já existente; sem novo segredo.

**D. Higiene**
- Mover o `<noscript>` do pixel para o `<body>`.
- Deixar o `Purchase` intocado (regra atual de 1ª compra permanece).

**E. Verificação após deploy**
- Rodar o teste de navegador de novo em `/?fbclid=...` e `/v2` confirmando: `_fbc` criado, PageView disparado em ambas, evento chegando no Test Events do Meta com correspondência navegador+servidor.

## Detalhes técnicos

- Arquivos: `index.html` (gate de rotas + noscript), `src/App.tsx` (redirect com query + tracker), novo `src/components/MetaRouteTracker.tsx`, novo `src/lib/meta-pixel.ts` (persistência de `_fbp`/`_fbc`, `trackPageView`, geração de `event_id`), `supabase/functions/meta-capi/index.ts` (aceitar `PageView`/`ViewContent` com dedupe).
- Nada muda em preço, checkout, backend de pagamento ou Purchase.

## Uma confirmação necessária

Preciso saber **qual URL exata está no anúncio "Isabella 1"** (raiz `olaaura.com.br` ou `olaaura.com.br/v2`, com quais parâmetros) e **qual dataset/pixel aparece vinculado ao conjunto** no Gerenciador de Eventos. Se o anúncio aponta para a raiz, o item A já resolve o 0 de Landing Page Views; se o dataset vinculado for outro, é preciso trocar o dataset no conjunto de anúncios (ajuste no Meta, não no código).
