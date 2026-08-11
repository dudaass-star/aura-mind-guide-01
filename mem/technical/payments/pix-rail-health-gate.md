---
name: Trilho PIX com health gate
description: asaas-health-check grava system_config.pix_rail_status; CheckoutV2 esconde PIX e força cartão quando o trilho está fora do ar
type: feature
---
- `asaas-health-check` (cron a cada 15 min) sonda o gateway ativo (`system_config.pix_gateway`, hoje `asaas`) e grava `system_config.pix_rail_status` (`healthy`, `httpStatus`, `detail`, `checkedAt`).
- `CheckoutV2.tsx` lê `pix_rail_status` no load: se `healthy=false`, esconde o `PaymentMethodToggle`, mostra bloco fixo "Cartão de crédito", força `payMethod='card'` em todos os ciclos (inclusive Trim/Sem/Anual, que antes abriam PIX) e bloqueia `handleOpenPix`. Eventos: `pix_rail_down` / `pix_blocked_rail_down` em `checkout-funnel.ts`.
- Estado atual: conta Asaas restrita (401 com body vazio nos endpoints operacionais; `finance/balance` responde). Último pagamento 05/08.
- `inter-probe` confirma `Deno.createHttpClient` disponível (supabase-edge-runtime 1.74.3 / Deno 2.1.4) → mTLS do Banco Inter é viável no runtime; falta Client ID/Secret + certificados. `GET ?capability=1` responde só a capability, sem segredo.
- Estado dos trilhos (11/08/2026): **nenhum PIX recorrente disponível**. Asaas restrita; Woovi em análise cadastral (72h); Banco Inter exige "Solicitar Integração" com prazo de **até 30 dias úteis**. Portanto: cartão Stripe é o único trilho de venda, e o health gate mantém o PIX escondido no checkout até algum trilho voltar. Não prometer PIX em copy/anúncio enquanto isso.
