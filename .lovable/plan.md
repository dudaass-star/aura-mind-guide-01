## Verificação

Simulei o 409 `WEEKLY_NOT_AVAILABLE_FOR_RETURNING` no `/v2/checkout` via Playwright (viewport mobile 420px). Comportamento observado:

- **Banner inline** aparece no topo, cor "info" (âmbar/dourado), com título "Mudamos pro plano Mensal automaticamente" + a mensagem do backend + link "Continuar com o Mensal".
- **Toggle de período** já está em "Mensal" quando o banner aparece.
- **Toast de reforço** ("Mudamos pro plano Mensal — confira acima.") aparece no rodapé por 4s.
- **Subtítulo** volta pro "7 dias por R$ X,XX • cancele quando quiser" (coerente com o Mensal, que tem trial).
- Trocar de plano manualmente **fecha o banner** — testado no código.

Ficou visível e não parece erro. Está pronto.

## Ajustes finos sugeridos (todos pequenos)

**1. Copy do CTA do banner mais acionável**
- Hoje: "Continuar com o Mensal" (rola até o fim do form).
- Trocar pra: "Ir para o pagamento" — mais direto, evita ambiguidade (usuário pode achar que "continuar com o Mensal" é confirmar mudança).

**2. Persistência do highlight no Mensal**
- Hoje o pulse dura 2.4s. Se o usuário demora pra rolar até o toggle, perde o sinal visual.
- Trocar por um **ring estático** enquanto `weeklyBlockedNotice` estiver ativo (some junto com o banner). Sem `animate-pulse`, só ring âmbar.

**3. Auto-scroll direto pro botão Pagar em vez do topo**
- Hoje o `triggerWeeklyBlockedFallback` rola pro topo (pra ver o banner). Mas o banner é grande e empurra o botão Pagar pra fora da tela.
- Alternativa: rolar pro topo por 800ms (garantindo que o banner seja visto), então rolar suavemente até o botão Pagar. Assim o usuário vê o aviso **e** encontra o próximo passo sem procurar.
- Ou mais simples: manter no topo, mas garantir que o banner seja compacto o suficiente pra o toggle + botão Pagar ficarem visíveis no scroll seguinte.

**4. Log de instrumentação (nice-to-have)**
- Adicionar `console.info` + evento GA4 `weekly_redirect_to_monthly` no `triggerWeeklyBlockedFallback` pra medir quantos retornantes caem nesse fluxo. Ajuda a validar depois se a mensagem converte ou se estamos perdendo gente aqui.

## Arquivos afetados

- `src/pages/CheckoutV2.tsx` — copy do CTA, ring estático em vez de pulse temporário, ajuste do scroll, evento GA4.
- `src/lib/ga4.ts` — nova função `trackWeeklyRedirectToMonthly` (se seguirmos com o item 4).

## Fora de escopo

- Pré-checagem antes do submit (evitar round-trip). Já discutido e descartado antes.
- Mudança de copy do backend — a mensagem atual do 409 é boa.
