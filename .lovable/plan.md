## Problema

Para o ticket de cobrança falhada do Marcelo, o `support-agent` gerou rascunho dizendo "atualize seus dados de pagamento diretamente no portal do nosso parceiro de pagamentos, a Stripe". Isso está errado por dois motivos:

1. **O portal `/meu-espaco` já tem o botão "Atualizar forma de pagamento"** no rodapé (`UserPortal.tsx` linhas 184–191), que abre o Billing Portal Stripe via edge `customer-portal`. O fluxo correto é: cliente entra no `/meu-espaco` (Google ou OTP) → clica em "Atualizar forma de pagamento" no rodapé.
2. **Expõe "Stripe" pro cliente final**, o que polui a marca e abre porta pra ele tentar logar direto no Stripe (não vai conseguir).

A raiz é que o SYSTEM_PROMPT do `support-agent` tem dois caminhos concorrentes — `send_portal_link` (canônico) e `send_stripe_billing_portal` (técnico) — e nenhuma regra força o primeiro para tickets de cartão recusado / atualizar pagamento. A IA escolhe o "Stripe" porque o nome bate com o problema.

## Solução

Tornar `send_portal_link` (URL `https://olaaura.com.br/meu-espaco`) o **único caminho** que a IA oferece pro cliente final em tickets de cobrança falhada / atualizar cartão, mencionando explicitamente o botão "Atualizar forma de pagamento" no rodapé. Deprecar `send_stripe_billing_portal` do catálogo visível à IA (mantém o case no executor pra uso admin futuro, mas não está mais nas opções do prompt).

### Arquivos a alterar

**1. `supabase/functions/support-agent/index.ts` (SYSTEM_PROMPT)**

- Remover `send_stripe_billing_portal` da lista de "AÇÕES SUGERIDAS" e do enum do tool schema (`suggested_action.type`), pra IA nunca mais sugerir.
- Estender a "REGRA DE ACESSO AO PORTAL (INVIOLÁVEL)" para cobrir também cobrança/atualização de pagamento:
  - Se o ticket é sobre **cobrança falhada, cartão recusado, atualizar cartão/forma de pagamento, "minha cobrança não passou", acesso bloqueado por falta de pagamento** → `suggested_action.type` DEVE ser `send_portal_link`.
  - `draft_body` DEVE conter literalmente a URL `https://olaaura.com.br/meu-espaco` e instruir: "entre com o mesmo email da sua conta (Google ou código por email) e clique em **Atualizar forma de pagamento** no rodapé pra trocar o cartão. Assim que a cobrança passar, o acesso volta automaticamente."
  - PROIBIDO mencionar "Stripe", "parceiro de pagamentos", "portal do Stripe" no texto pro cliente. A marca é Aura; o backend resolve.
  - Exceção PIX/Asaas: se o contexto mostra que o cliente paga via Asaas (sem `stripe.subscriptions`), o rascunho deve oferecer **gerar nova cobrança PIX** e pedir confirmação — não apontar pro botão (que só funciona pra cartão Stripe).

**2. `supabase/functions/support-execute-action/index.ts`**

- Manter o case `send_stripe_billing_portal` existente (não quebrar histórico), mas como o enum do prompt não o oferece mais, ele só pode ser disparado manualmente por admin — comportamento ok.
- Nenhuma mudança de runtime necessária aqui.

**3. `mem/features/support/portal-access-resolution.md`**

- Adicionar parágrafo: o portal `/meu-espaco` tem o botão "Atualizar forma de pagamento" no rodapé que abre o Billing Portal Stripe via `customer-portal`. Tickets de cobrança falhada / cartão recusado seguem o mesmo fluxo: `send_portal_link` + instrução pra clicar no botão. Nunca expor "Stripe" pro cliente. PIX/Asaas é exceção (oferecer nova cobrança).

### Fora de escopo

- `customer-portal/index.ts`, `UserPortal.tsx`, `ChangePlanDialog.tsx`, RLS, schema, UI.
- Renderização de assinatura/plano no portal.
- Asaas refund/cancel (não é o assunto).

### Validação

Após deploy, regenerar o rascunho do ticket do Marcelo (cobranca_falhou) e confirmar:
- `suggested_action.type === "send_portal_link"`.
- `draft_body` contém a URL `https://olaaura.com.br/meu-espaco` e a instrução "Atualizar forma de pagamento" (rodapé).
- `draft_body` **não** contém "Stripe" nem "parceiro de pagamentos".