# Checkout: reduzir o atrito de entrada e alinhar com o hábito de pagamento do Brasil

Quatro ajustes de conversão no `/v2/checkout`, todos em frontend/apresentação. As quatro sugestões fazem sentido; marquei abaixo onde recomendo ajustar a execução.

## 1. Abrir no Essencial em vez do Direção
Quando não vem plano na URL nem no state da navegação, o checkout passa a abrir com **Essencial** (hoje abre em Direção). Quem chega por link de plano específico (landing, e-mail, anúncio) continua caindo no plano escolhido.

Efeito prático: o primeiro número da página passa de R$ 9,90 para R$ 6,90, e a mensalidade de referência de R$ 49,90 para R$ 29,90.

Ressalva honesta: isso tende a subir volume e descer ticket médio. O Direção segue logo abaixo com selo, então o upgrade continua visível — mas vale acompanhar o efeito no faturamento depois (os eventos de funil por plano já são registrados).

## 2. Essencial com 1 sessão por mês
Verifiquei no backend: o Essencial **já recebe 1 sessão/mês** (`PLAN_SESSIONS` e `PLAN_CONFIGS` marcam `essencial: 1`, e a Aura já tem o roteiro de setup de "1 sessão do mês, plano Essencial"). A UI é que está desatualizada — mostra "Chat ilimitado 24/7" no checkout e "—" na landing.

Correção: o Essencial passa a dizer "1 sessão/mês + chat ilimitado" no checkout e nas duas seções de preço da landing, que hoje contradizem o produto entregue.

Ajuste que recomendo junto: a linha "R$ X por sessão" hoje aparece em qualquer plano com sessão. Com o Essencial em 1 sessão, ela exibiria "R$ 29,90 por sessão" — o pior número da página. Vou limitá-la aos planos com 4+ sessões (Direção e Transformação), onde ela ajuda em vez de atrapalhar.

## 3. "Recomendado" no lugar de "Mais popular"
Troca do selo do Direção. Concordo: "Mais popular" é prova social que não sustentamos publicamente; "Recomendado" é uma recomendação nossa, honesta e sem risco.

## 4. Abrir no PIX em vez do Cartão
No ciclo mensal o método passa a vir com **PIX Automático** pré-selecionado, com duas guardas:
- se o trilho PIX estiver fora do ar (`pix_rail_status`), o checkout continua caindo em Cartão automaticamente, como já acontece hoje;
- nos ciclos longos (Trim/Sem/Anual) nada muda — já abrem no PIX.

Concordo com a leitura: PIX é o hábito dominante e o cartão trava quem está sem limite. O cartão continua a um clique, com o mesmo peso visual.

## Detalhes técnicos

- `src/pages/CheckoutV2.tsx`
  - `initialPlan`: fallback `"direcao"` → `"essencial"`.
  - `payMethod` inicial e o `useEffect` que reage a `billingPeriod`/`pixRailUp`: passam a preferir `"pix"` sempre que o trilho estiver de pé, inclusive no mensal, mantendo o fallback para `"card"` quando `pixRailUp === false`.
  - `plans.essencial.sessions`: `0` → `1`; o texto do card passa a usar a contagem real.
  - Linha "R$ … por sessão": condicionar a `plan.sessions >= 4` (o "melhor custo por sessão" fica só no Direção).
  - Selo do Direção: "Mais popular" → "Recomendado".
- `src/components/Pricing.tsx` e `src/components/v2/PricingV2.tsx`: Essencial passa a listar "1 sessão guiada/mês (45min)" em vez de sessões "—".
- Sem mudança de preço, de gateway, de contrato do checkout ou de backend.

## Fora deste plano
Para discutir depois, não incluído aqui: reordenar os cards de plano, mudar o ciclo padrão (hoje mensal) e teste A/B do plano de entrada.