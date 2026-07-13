## Objetivo

Fechar as 3 pendências que sobraram da implementação de cartão via Asaas:

1. Troca de plano no portal funciona pra quem assinou cartão Asaas recorrente (hoje cai no Stripe e quebra).
2. Cartão parcelado (installment) tem renovação — hoje o Asaas cobra as N parcelas e para; usuário perde acesso silenciosamente.
3. Roteamento do `ChangePlanDialog` deixa de usar o proxy frágil "tem PIX Asaas?" e passa a olhar o gateway real do cartão.

## Escopo — o que muda

### 1. `change-asaas-plan` aceita CREDIT_CARD recorrente

Hoje a função só troca subs PIX (com bloqueio explícito pra PIX Automático Bacen e ignorando `CREDIT_CARD_RECURRING`).

Mudança:
- Detectar `billingType` da sub antiga via `GET /subscriptions/{id}` (`CREDIT_CARD` vs `PIX`).
- Se CREDIT_CARD:
  - Buscar `creditCardToken` da sub antiga (Asaas devolve em `creditCard.creditCardToken`).
  - Criar nova sub `POST /subscriptions` com `billingType: CREDIT_CARD` + `creditCardToken` (reusa cartão salvo — não pede dados de novo).
  - Manter `nextDueDate` da sub antiga (sem cobrança hoje, igual PIX).
  - Cancelar a antiga (best-effort, já implementado).
- Se PIX: fluxo atual intocado.
- Bloqueio de PIX Automático Bacen segue ativo só quando `billingType=PIX`.
- Bloqueio de installment: se a "sub" na verdade é um pagamento parcelado (`asaas_subscription_id IS NULL` mas `payment_method='CREDIT_CARD_INSTALLMENT'`), devolver erro claro: "Sua assinatura é parcelada. Aguarde o fim do ciclo pra trocar de plano ou entre em contato."

### 2. Renovação automática de cartão parcelado

`POST /payments` com `installmentCount` cobra N parcelas e termina — sem recorrência. Sem intervenção, usuário fica `canceled` quando `plan_expires_at` chega.

Solução: agendar lembrete de renovação D-3 antes do fim do ciclo via `scheduled_tasks`.

- No `webhook-asaas`, quando ativa um payment com `payment_method='CREDIT_CARD_INSTALLMENT'` **e** não é renewal:
  - Inserir `scheduled_tasks` com `execute_at = plan_expires_at - 3 dias`, `action_type = 'installment_renewal_reminder'`, `payload = { userId, plan, billing, portalToken }`.
- Nova edge function `installment-renewal-reminder`:
  - Verifica se profile ainda está `active` (senão, ignora).
  - Dispara WhatsApp via `sendProactive` com template curto de utility ("sua assinatura Aura renova em 3 dias — pague em `/pagamento?t=<token>`") + email fallback via `send-transactional-email`.
- `execute-scheduled-tasks` já processa qualquer `scheduled_tasks`; adicionar branch pra chamar a nova função.
- Novo template WhatsApp Meta: `installment_renewal_v1` com 2 variáveis (nome + link do portal). Registrar em `whatsapp_templates` com `meta_variable_count=2`. **Nota pro usuário:** template precisa ser aprovado na Meta antes de rodar em produção; até lá cai só no email.

### 3. Roteamento do `ChangePlanDialog` por gateway real

Hoje: `paymentMethod={isAsaasPix ? "pix" : "card"}` — só distingue PIX Asaas de "todo o resto → Stripe". Usuário cartão Asaas cai em `change-subscription-plan` (Stripe) e falha.

Mudança em `src/pages/UserPortal.tsx`:
- Adicionar `card_gateway` ao select do profile no portal (já existe no schema).
- Estender prop pra 3 casos: `paymentGateway: "stripe-card" | "asaas-pix" | "asaas-card"`.
- Lógica:
  - `isAsaasPix=true` → `asaas-pix`
  - senão se `profile.card_gateway='asaas'` → `asaas-card`
  - senão → `stripe-card`

Em `ChangePlanDialog`:
- Trocar prop `paymentMethod` por `paymentGateway`.
- Roteamento:
  - `stripe-card` → `change-subscription-plan` (atual)
  - `asaas-pix` / `asaas-card` → `change-asaas-plan` (mesma função, ela agora resolve o billingType internamente)
- Copy do dialog: `asaas-card` mostra "cobrança nova só a partir da próxima fatura, mesmo cartão"; `asaas-pix` segue atual.

### 4. Ajuste bônus — `AsaasCardForm` status pendente

Já retorna `pending: true` pra status ≠ CONFIRMED/RECEIVED (ex.: `AWAITING_RISK_ANALYSIS`). Adicionar copy melhor: em vez de redirecionar direto pra `/obrigado`, mostrar tela intermediária "Pagamento em análise — aviso em minutos" com link pro portal, pra evitar confusão do usuário achar que deu certo antes do webhook confirmar.

## Fora de escopo

- 3DS challenge com redirect (Asaas normalmente resolve internamente).
- Migrar subs cartão Stripe existentes pra Asaas.
- Trocar plano estando com cartão parcelado meio-caminho.

## Ordem de execução

1. `change-asaas-plan` — suporte a CREDIT_CARD recorrente + bloqueio installment.
2. `UserPortal.tsx` + `ChangePlanDialog.tsx` — nova prop `paymentGateway`.
3. `webhook-asaas` — agendar reminder em ativação de installment.
4. Nova edge function `installment-renewal-reminder` + branch em `execute-scheduled-tasks`.
5. Seed do template `installment_renewal_v1` em `whatsapp_templates` (via insert tool — user precisa registrar+aprovar na Meta em paralelo).
6. `AsaasCardForm` — tela intermediária de pendente.

## Risco

- Reuso de `creditCardToken` na nova sub: se Asaas invalidar o token após cancelamento da sub antiga, a primeira cobrança nova pode falhar. Mitigação: fazer `DELETE` da sub antiga **depois** da nova sub estar criada (fluxo atual já faz isso).
- Template Meta pendente: enquanto não for aprovado, `installment-renewal-reminder` roda só o email — logar warning quando WhatsApp falhar por template inexistente.
