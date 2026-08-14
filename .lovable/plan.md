# Pixel e eventos do Meta: o que está 100%, o que ainda vaza e o que reduz custo

## Verificado agora nos dados (últimas 24h e 30 dias)

Log de envios (`meta_capi_log`), 24h — **zero erros de resposta do Meta**:

| Evento | Enviados | com fbc | com fbp | com e-mail/tel |
|---|---|---|---|---|
| PageView | 93 | 55 | 79 | — |
| ViewContent | 72 | 43 | 58 | — |
| InitiateCheckout | 4 | 4 | 4 | 4 |
| Lead | 4 | 4 | 4 | 4 |
| Purchase | 1 | 1 | 1 | 1 |

Purchase nos últimos 30 dias: 11 envios, 7 com `fbc` (64%), 11 com e-mail+telefone (100%), 0 erros. Nenhum `Subscribe` enviado ainda (a primeira cobrança cheia de 8º dia ainda não caiu no período).

## Furo 1 — `Lead` ainda sai em produção

`Lead` e `InitiateCheckout` continuam saindo aos pares (4 e 4, último às 16:21 de hoje). No código atual só existe `InitiateCheckout`; ou seja, o que está no ar é build anterior às correções. **Publicar** é o passo que trava todo o resto. Depois de publicar, `Lead` tem que parar de aparecer no log.

## Furo 2 — a landing V2 ainda manda preço no `ViewContent`

Confirmado no código e na requisição capturada do navegador: `IndexV2.tsx` dispara `ViewContent` com `value: 6.90`. A correção anterior tirou o valor só do checkout. É exatamente esse par de eventos de preço idêntico que alimenta o alerta "envie mais preços" do Meta.

Ação: remover `value`/`currency` do `ViewContent` da landing. Preço fica só em `InitiateCheckout`, `Purchase` e `Subscribe`.

## Furo 3 — páginas mortas com `fbq` cru

`src/pages/Index.tsx` (landing antiga) e `src/pages/Checkout.tsx` (checkout antigo) não estão mais em rota, mas ainda contêm `fbq('track','ViewContent', ...)` com preço, sem `event_id` e sem CAPI. Se qualquer uma voltar a ser usada, volta a duplicação sem dedupe.

Ação: remover esses blocos de tracking (a lógica de GA4 permanece).

## Redução de custo — o que realmente move o CPA

1. **`external_id` em todos os eventos.** Hoje mandamos `em`, `ph`, `fbp`, `fbc`. O `external_id` (identificador estável do lead, hasheado) é o parâmetro que mais eleva a Qualidade de Correspondência do Evento com menor esforço, e vale para PageView/ViewContent/InitiateCheckout/Purchase/Subscribe. Vou usar um id anônimo de 1ª parte, persistido em cookie, e o telefone normalizado quando já conhecido — mesmo valor no navegador e no CAPI.
2. **Cache de identidade também no início do checkout.** Hoje o `fbp/fbc` só é guardado quando o lead cria a cobrança no gateway. Guardando já no `InitiateCheckout` (quando e-mail/telefone existem), o `Purchase` de quem paga depois em outro dispositivo herda o `fbc` — é a razão principal dos 64% de cobertura.
3. **`Subscribe` validado na prática.** Ainda não saiu nenhum. Vou adicionar ao painel a linha de `Subscribe` enviado/aceito, para confirmar no primeiro 8º dia sem depender de logs.
4. **Checklist no Meta (fora do código, você faz):** verificar o domínio olaaura.com.br, ordenar os eventos priorizados com `Purchase` no topo (Medição Agregada de Eventos) e conferir a Correspondência Avançada Automática ligada no pixel 939366085297921. Sem isso, o iOS derruba atribuição independentemente do nosso código.

## Detalhes técnicos

- `src/pages/IndexV2.tsx`: `ViewContent` sem `value`/`currency`.
- `src/pages/Index.tsx`, `src/pages/Checkout.tsx`: remover blocos `fbq` do Meta.
- `src/lib/meta-pixel.ts`: gerar/persistir `aura_eid` (cookie 1º nível, 180 dias), enviar `external_id` no `fbq` (via `init` de Advanced Matching) e no corpo do CAPI.
- `supabase/functions/meta-capi/index.ts`: aceitar `external_id` (hash SHA-256) e gravar presença no `meta_capi_log`; salvar `fbp/fbc` em `meta_identity_cache` quando o evento traz e-mail/telefone.
- `src/components/admin/CheckoutFunnelPanel.tsx`: incluir `Subscribe` e cobertura de `external_id` na tabela de qualidade do sinal.
- Nada muda em preço, cobrança, webhooks de pagamento ou regras de `Purchase`/`Subscribe`.

## Verificação após publicar

24-48h depois: `Lead` = 0 no log; alerta de preços do Meta deve sair do ViewContent; cobertura de `fbc` no Purchase acima de 80%; comparar "Chegadas do anúncio (fbclid/utm)" do painel com os cliques do Ads Manager.
