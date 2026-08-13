# Medir se o lead rola a landing /v2 ou clica no CTA de cima

## Situação hoje (verificada no código)

- A landing `/v2` (`src/pages/IndexV2.tsx`) dispara só `ViewContent` (Meta/CAPI) e `view_item` (GA4). Não há rastreio de rolagem: o hook `useScrollDepth` existe em `src/hooks/useScrollDepth.ts` mas **não é usado na `/v2`**.
- Os cliques de CTA (`trackCtaClick`) vão apenas para o GA4, com `cta_location` = hero / pricing / sticky / header / final. Nada disso é gravado no banco.
- Todos os CTAs apontam para o mesmo link (`/v2/checkout`), sem parâmetro de origem — então nem pelos eventos de checkout dá para saber de onde veio o clique.

Resultado: hoje **não é possível responder essa pergunta com dados**. O GA4 pode ter algum sinal de cliques, mas sem profundidade de rolagem na `/v2` e sem dados no banco, não há como cruzar "rolou até onde" com "clicou onde".

## O que vou construir

### 1. Rastrear engajamento da landing no banco
Novo evento gravado em `checkout_funnel_events` (mesma tabela já usada no funil, sem nova tabela), por sessão anônima:
- `landing_view` — abriu a `/v2`
- `landing_scroll_25/50/75/100` — marcos de rolagem (uma vez cada por sessão)
- `landing_cta_click` — com a origem no campo `detail` (`hero`, `pricing`, `sticky`, `header`, `final`, `demo`)
- tempo na página e profundidade máxima gravados no `meta` na saída da página

Mantém o GA4 como está (nada removido), só espelha no banco para eu poder consultar.

### 2. Marcar a origem do clique até o checkout
Cada CTA da landing passa a levar `?src=hero` (ou pricing/sticky/final/header/demo) para `/v2/checkout`. O checkout já registra `page_view` no funil; a origem entra no `meta`. Assim dá para ver não só quem clicou de cima, mas se quem clica de cima converte melhor ou pior do que quem lê a página inteira.

### 3. Painel no admin
Bloco novo em "Semanais & Conversão" (junto do painel de funil existente) com, por mês:
- % que rolou 25 / 50 / 75 / 100
- distribuição dos cliques por posição da página
- comparação: taxa de pagamento de quem clicou no hero vs. quem clicou depois de rolar
- contas de teste `@olaaura.com.br` excluídas

## Detalhes técnicos

- `src/lib/landing-analytics.ts` (novo): IntersectionObserver/scroll listener + `logFunnel`, deduplicado por `sessionStorage`, fire-and-forget.
- `src/lib/checkout-funnel.ts`: adicionar os novos passos ao tipo `FunnelStep`.
- `src/pages/IndexV2.tsx`: montar o hook de engajamento.
- Componentes `v2` (Hero, Pricing, Sticky, Final, Header, Demo): passar `src` no link e no clique.
- `src/components/admin/LandingEngagementPanel.tsx` (novo) + montagem em `src/pages/AdminEngagement.tsx`.
- Sem mudança de schema: `checkout_funnel_events` já tem `step`, `detail`, `meta`, `anon_session_id`.

## Observação sobre prazo

Os dados começam a existir só a partir da publicação — não é possível reconstruir agosto retroativamente. Em 3-5 dias de tráfego dá para ler o padrão com segurança.
