# Fechar os buracos de medição do checkout + ajustes óbvios de conversão

## Contexto
Em agosto, 126 toques em "Pagar" no mobile geraram pouquíssimos pagamentos. Já sabemos onde a visão falha: não registramos sucesso, não registramos 3DS, não registramos abandono (cartão e PIX) e os cliques em formulário vazio se misturam com erro real de validação.

## Bloco 1 — Medição (fecha os 5 buracos)
1. **Evento de sucesso no funil**: registrar `purchase` no `/obrigado` (e no webhook, para pagamentos que confirmam fora da tela), com plano, ciclo, método e valor. Hoje o funil termina sem linha de chegada.
2. **3DS / ação exigida**: quando o pagamento exigir autenticação do banco, registrar `card_action_required` no funil (o webhook já recebe esse status, só não grava).
3. **Abandono do cartão**: registrar `card_abandoned` quando o usuário fecha/sai do formulário embutido do Stripe sem concluir.
4. **Abandono do PIX**: registrar `pix_abandoned` quando o modal do PIX é fechado com QR gerado e sem pagamento.
5. **Separar clique vazio de erro real**: cliques no botão fixo com formulário totalmente vazio passam a ser `cta_empty_form` (e rolam a página até o formulário, focando o primeiro campo), reservando `form_invalid` para dado preenchido e inválido.

## Bloco 2 — Conversão (o que já está evidente)
- Botão fixo com formulário vazio: em vez de "erro", rola até o formulário e foca o campo — remove o beco sem saída do mobile.
- PIX sempre visível: quando o trilho estiver instável, mostrar o PIX com aviso curto em vez de esconder o método (hoje 13 `rail_down` ainda aconteceram depois de 12/08).
- Reforço no PIX: após gerar o QR, destacar o botão "copiar código" (maior contraste/posição), já que só 2 de 10 QRs foram copiados.

## Bloco 3 — Painel
Adicionar ao painel de funil do admin as etapas novas: `purchase`, `card_action_required`, `card_abandoned`, `pix_abandoned`, `cta_empty_form`, com taxa de conversão por método (cartão vs PIX) no período.

## Detalhes técnicos
- Frontend: `src/pages/CheckoutV2.tsx` (novos `logFunnel`, scroll-to-form, PIX resiliente), `src/lib/checkout-funnel.ts` se precisar de tipos, `src/pages/ThankYou.tsx` (`purchase`).
- Backend: `supabase/functions/stripe-webhook/index.ts` (grava `card_action_required` e `purchase`), `supabase/functions/webhook-woovi/index.ts` (`purchase` no PIX).
- Admin: `src/components/admin/CheckoutFunnelPanel.tsx`.
- Sem migração de banco: tudo cabe em `checkout_funnel_events`.
- Mudanças no checkout são aditivas e não alteram preço, plano padrão nem método padrão (PIX segue padrão).
