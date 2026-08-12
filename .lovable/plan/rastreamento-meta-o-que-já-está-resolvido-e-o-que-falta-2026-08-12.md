# Rastreamento Meta: o que já está resolvido e o que falta

## O que eu verifiquei agora (fatos, não suposições)

Rodei o site em navegador real, no build atual e no site publicado.

**No build atual (preview) — já funciona:**
- Entrando em `/?fbclid=TESTCLICK123`, o redirecionamento leva para `/v2?fbclid=TESTCLICK123` (o parâmetro sobrevive).
- O cookie `_fbc` é gravado com o `fbclid` (validade de 90 dias), então o vínculo com o anúncio sobrevive à navegação interna.
- O pixel `939366085297921` carrega na landing (`connect.facebook.net/fbevents.js` + config do pixel).
- O `PageView` e o `ViewContent` são enviados também pelo servidor (Conversions API): duas chamadas para a função `meta-capi` foram observadas, com o mesmo `event_id` do navegador (deduplicação).
- O `<noscript>` do pixel já está no início do `<body>`, fora do `<head>` (erro de sintaxe HTML corrigido).
- `PageView` também dispara em troca de rota da SPA (o `MetaRouteTracker` está montado no app).
- O funil pago (`ViewContent`, `InitiateCheckout`, `Purchase`) já envia `_fbp`/`_fbc` pelo servidor nos webhooks de Stripe, Asaas, Woovi e Inter.

**No site publicado (olaaura.com.br) — ainda não:**
- Entrando em `https://olaaura.com.br/?fbclid=PRODTEST1`, o site termina em `/v2` **sem** o `fbclid`, e nenhum cookie `_fbc` é criado.
- Nenhuma chamada à Conversions API acontece no site publicado.

Conclusão: as correções estão no código, mas **não estão no ar**. O anúncio "Isabella 1" aponta para `/v2` (onde o `fbclid` sobrevive mesmo no build antigo), então a causa remanescente do "0 visualizações da página de destino" é o disparo/atribuição da versão publicada, não o redirecionamento.

## Plano

1. **Publicar a versão atual.** É o passo que efetivamente muda o cenário do Meta. Sem isso, nada do que foi corrigido chega aos anúncios.
2. **Revalidar no site publicado** com o mesmo teste que fiz agora: `/v2?fbclid=...` e `/?fbclid=...` — conferir preservação do parâmetro, cookie `_fbc`, carregamento do pixel e chegada do `PageView` no CAPI.
3. **Conferir os logs do CAPI** após a publicação, para confirmar `PageView` recebido com `fbc` presente (o log já registra `fbc_present`/`fbp_present`).
4. **Confirmar o dataset do anúncio no Gerenciador de Eventos.** O ID citado pelo Meta (`120250376256180004`) tem formato de ID de anúncio/conjunto, não de pixel. O pixel instalado é `939366085297921`. Se o anúncio estiver ligado a outro dataset, todo o sinal correto continuará indo para o lugar errado — esse é o único ponto que depende de uma verificação sua na conta.

## Detalhes técnicos

- Sem mudanças de código previstas nesta etapa: `index.html`, `src/App.tsx`, `src/lib/meta-pixel.ts`, `src/components/MetaRouteTracker.tsx` e `supabase/functions/meta-capi` já contêm as três correções pedidas pelo Meta (persistência do `fbclid`, `noscript` no `body`, CAPI ativo).
- O disparo do `PageView` pelo navegador não é mensurável de dentro do sandbox: o `fbevents.js` não emite a requisição para `facebook.com/tr` nesse ambiente (confirmei que nem um `fbq('track','PageView')` manual dispara). A validação real desse lado é o Test Events do Gerenciador de Eventos, após a publicação.
- Se, depois de publicado, o Gerenciador ainda mostrar `PageView` só por servidor, o próximo ajuste seria enviar o `PageView` também no `index.html` (com `event_id` gerado ali e reaproveitado pelo app), garantindo o evento antes do bundle React carregar.
