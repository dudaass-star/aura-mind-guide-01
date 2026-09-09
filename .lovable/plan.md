# Cris Silveiira: troca de plano travada e pedido de cartão

## O que aconteceu de fato

Cris está no **Essencial trimestral (R$ 59,70)**, pagando por **PIX Automático (Woovi)**, com mandato autorizado em 20/08 e primeira parcela paga no mesmo dia.

Ao tentar trocar de plano no Meu Espaço, ela caiu em dois furos reais:

1. **O portal não reconhece o PIX Automático da Woovi.** A tela de troca só conhece cartão, PIX Asaas e PIX Inter. Quem paga pela Woovi é tratado como cartão. A troca em si chega ao lugar certo, mas o resultado que volta é **um QR novo de autorização** — e a tela, achando que é cartão, mostra só um aviso de "plano atualizado" e **joga o QR fora**. Ou seja: a troca nunca se completa e ela não vê o que precisava aprovar no banco.
2. **Não existe caminho para trocar PIX por cartão.** O botão "Atualizar forma de pagamento" só responde a quem paga por PIX Automático com um recado mandando falar com o suporte. É exatamente o pedido dela ("gostaria de pagar no cartão de crédito ou débito").

Também apareceu um problema de acesso: o trimestral dela foi pago em 20/08, mas o acesso está liberado até **20/02/2027** — cerca de seis meses, o dobro do pago.

## O que fazer

### 1. Fazer o portal reconhecer o PIX Automático da Woovi
Passar a identificar esse meio de pagamento na tela de troca de plano, com o mesmo comportamento já usado no PIX do Inter: ao confirmar a troca, mostrar a tela de sucesso com o **QR e o código PIX** para copiar, explicando que é uma autorização única e que o plano atual continua valendo até o fim do período já pago.

### 2. Permitir sair do PIX e ir para o cartão
No "Atualizar forma de pagamento", quem paga por PIX Automático passa a ter uma ação de verdade em vez de um recado: um botão que abre o checkout no cartão já com o plano e o ciclo atuais. Ao concluir, o mandato PIX é cancelado e o acesso segue sem interrupção — nunca cancelamos o PIX antes de o cartão existir.

### 3. Resolver o caso dela agora
Gerar o caminho para a Cris pagar no cartão e, quando o cartão entrar, encerrar o mandato PIX. Enquanto isso o acesso dela não muda.

### 4. Corrigir o acesso concedido além do pago
Alinhar a validade do trimestral ao período efetivamente pago (três meses a partir do pagamento) e conferir se outros trimestrais/semestrais da Woovi receberam validade maior que o pago, corrigindo os que estiverem fora.

Sem mensagens automáticas novas, sem alerta para admin e sem mexer em gateway de quem está funcionando.

## Detalhes técnicos

- `src/pages/UserPortal.tsx`: adicionar `"woovi-pix"` ao `paymentGateway` passado ao `ChangePlanDialog` (hoje `card_gateway === "woovi"` cai no `else` → `"stripe-card"`); e no `handleOpenBillingPortal`, para `isWooviPix`/`isInterPix`/`isAsaasPix`, oferecer ação "Passar para cartão" em vez de só `toast`.
- `src/components/portal/ChangePlanDialog.tsx`: aceitar `"woovi-pix"` no tipo `paymentGateway`, incluir em `showsNextCharge` e nas cópias (`copyDescription`/`copyConfirm`) reutilizando o texto do Inter; o retorno de `change-subscription-plan` já traz `qrCodeImage`/`copyPaste` via spread de `criar-pix-recorrente-woovi` — hoje descartados por cair no ramo de cartão.
- `supabase/functions/change-subscription-plan/index.ts`: ramo Woovi já existe e está correto (linhas 143-205); só validar o nome dos campos de QR devolvidos por `criar-pix-recorrente-woovi` (modo `reauthorize`, `deferReplacement`) para o dialog renderizar.
- Migração PIX→cartão: novo fluxo no portal reaproveitando `create-checkout` com `plan`/`billing` atuais; cancelamento do mandato Woovi só após `stripe-webhook` confirmar assinatura ativa (marcar `replaced_by_subscription_id` / `card_gateway = 'stripe'`).
- Acesso: `profiles.plan_expires_at` de `ef894fb2-…` está em 2027-02-20 com entrada trimestral paga em 2026-08-20. `supabase/functions/_shared/woovi-access.ts` só conhece `ENTRY_ACCESS_DAYS = 8` e `CYCLE_ACCESS_DAYS = 31`; precisa de janela por `billing_period` (quarterly ≈ 92, semiannual ≈ 184, yearly ≈ 366) e a auditoria (`woovi-pix-audit`) passa a aplicar o teto por ciclo. Correção pontual por SQL de manutenção para as linhas já fora.
- Sem migration de schema. Redeploy de `change-subscription-plan` e `woovi-pix-audit`.
