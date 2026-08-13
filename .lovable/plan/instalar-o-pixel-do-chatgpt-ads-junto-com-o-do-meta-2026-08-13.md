# Instalar o pixel do ChatGPT Ads junto com o do Meta

## Resposta curta
Sim, pode. Os dois pixels são independentes: o `oaiq` da OpenAI e o `fbq` do Meta não compartilham variável global, cookie nem script. Rodando lado a lado não há conflito — o único cuidado é não duplicar o script de setup na mesma página (é o que a própria doc pede) e não deixar `debug: true` em produção.

## O que vou fazer

1. **Setup sitewide no `index.html`**
   - Adicionar o script de init do pixel `4DosRHCmjrnJkM9nitjuu5` no `<head>`, logo antes do bloco do Meta.
   - Mesmo portão que o Meta já usa: carrega em tudo, **exceto** rotas privadas (`/admin/*`, `/meu-espaco/*`).
   - `debug: false` (o `true` do exemplo só serve pra teste).

2. **Helper `src/lib/openai-pixel.ts`**
   - Função fina `oaiqMeasure(event, payload)` com guarda de existência, para nunca quebrar a página se o script for bloqueado.

3. **Eventos nos pontos que já existem**
   - `page_view` a cada troca de rota da SPA (junto do `MetaRouteTracker`, que já roda), para o pixel não ficar mudo em navegação interna.
   - `InitiateCheckout` do checkout (`CheckoutV2`, onde o Meta já dispara) → evento equivalente da OpenAI no clique de pagar.
   - Compra em `/obrigado` (`ThankYou`), onde o Meta já marca a conversão, com `amount` e `currency: "BRL"`.

4. **Verificação**
   - Rodar o site e confirmar no console que `oaiq` inicializa, que os eventos saem e que o Meta continua disparando normalmente (nenhuma regressão no `fbq`/CAPI).

## Detalhes técnicos
- Arquivos: `index.html` (script de setup), novo `src/lib/openai-pixel.ts`, `src/components/MetaRouteTracker.tsx` (adiciona o `page_view` da OpenAI na mesma troca de rota), `src/pages/CheckoutV2.tsx` e `src/pages/ThankYou.tsx` (eventos de funil).
- Nada muda no Meta Pixel, no CAPI, no GA4, no Clarity, em preços ou no fluxo de pagamento.
- Sem API server-side da OpenAI nesta etapa: o ChatGPT Ads hoje só oferece o pixel de navegador. Se depois quisermos cobertura contra bloqueadores, avaliamos quando eles liberarem um endpoint de servidor.

## Uma decisão sua
O nome do evento de compra: uso `purchase` com valor em BRL. Se o painel do ChatGPT Ads listar um nome específico esperado (como no exemplo `registration_completed`), me diga qual e eu uso exatamente esse.
