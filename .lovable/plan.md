# Os "6 inícios de checkout" do Meta: o que os dados mostram e como conferir direto na API

## Resposta rápida: consigo, sim, ler o Meta via API

O token de Ads/CAPI já está no backend (o mesmo que manda os eventos). Falta apenas um endpoint de leitura para eu consultar as estatísticas do pixel sem você precisar tirar print. Isso está no plano abaixo.

## O que já verifiquei nos nossos dados (hoje, 14/08, horário de Brasília)

- **Inícios de checkout reais: 2.** Dois visitantes abriram o modal do PIX (06:30 e 09:17) e cada um gerou QR. Nenhum clique de "pagar" no cartão hoje (zero `form_submit`), então o trilho do cartão não disparou início nenhum.
- **Nosso log do CAPI confirma 2:** exatamente 2 `InitiateCheckout` e 2 `Lead` enviados pelo servidor, todos com status 200, com e-mail, telefone, `_fbp` e `_fbc` presentes.
- **Cada início vira 2 eventos recebidos no Meta:** um pelo navegador (pixel) e um pelo servidor (CAPI), com o mesmo `event_id`. Na tela "Visão geral" o Meta mostra **eventos recebidos**, antes da deduplicação — é por isso que o seu próprio print traz a caixinha "Navegador 1 / Servidor 2". Logo, 2 inícios reais aparecem como ~4 recebidos.
- **Sobram ~2 eventos a explicar.** Duas suspeitas concretas, que só a leitura direta na API do Meta separa: (a) contagem de recebidos em outro fuso/janela do Gerenciador; (b) a página de checkout antiga em `/checkout` — ela ainda está roteada e dispara `Lead` + `InitiateCheckout` pelo navegador **sem** registrar nada no nosso funil, então qualquer acesso a ela some dos nossos números e aparece só no Meta.

## O que vou fazer

1. **Leitura direta da API do Meta (novo endpoint de diagnóstico)**
   Função de backend somente-leitura que consulta as estatísticas do pixel `939366085297921` (total por evento, por dia e por canal navegador/servidor) e devolve o número junto com o nosso contador do mesmo período. Assim eu passo a conferir sem print.

2. **Painel de conciliação no admin**
   Uma linha no painel de funil comparando, por dia: inícios reais (nosso funil) × eventos enviados pelo servidor × eventos recebidos no Meta. Divergência fica visível na hora, sem interpretação.

3. **Parar de dobrar o sinal com `Lead` + `InitiateCheckout`**
   Hoje a mesma ação dispara os dois eventos, o que duplica o volume que você lê no Gerenciador e polui a otimização da campanha. Proposta: manter **só `InitiateCheckout`** no início de checkout (é o evento padrão que o Meta otimiza) e liberar `Lead` apenas se você quiser usá-lo como conversão de campanha separada.

4. **Fechar o vazamento do checkout antigo**
   `/checkout` passa a redirecionar para `/v2/checkout` preservando os parâmetros, ou recebe a mesma instrumentação de funil. Sem isso, sempre vai existir um punhado de eventos no Meta que não existe nos nossos números.

## Detalhes técnicos

- Nova função `supabase/functions/meta-insights/index.ts`: `GET` em `graph.facebook.com/v21.0/{pixel_id}/stats` (agregação por evento e por dia) + `/{pixel_id}` para `last_fired_time`; usa `META_ACCESS_TOKEN` (ou o token renovado em `instagram_config`), não expõe o token na resposta.
- Conciliação: consulta em `checkout_funnel_events` (`pix_modal_open`, `form_submit`) e `meta_capi_log` agrupada por dia BRT; exibida em `src/components/admin/CheckoutFunnelPanel.tsx`.
- Ajuste do evento duplicado em `src/pages/CheckoutV2.tsx` (`fireCheckoutStartTracking`) e na página legada `src/pages/Checkout.tsx`.
- Rota `/checkout` em `src/App.tsx`.

## Uma decisão sua

Sobre o item 3: você quer **manter o `Lead`** (útil se alguma campanha estiver otimizando por Lead) ou **remover** e ficar só com `InitiateCheckout`? Se as campanhas hoje otimizam por "Iniciar finalização da compra", remover é o certo.
