
# Troca de plano PIX Asaas — self-service automática (sem proração)

Hoje quem paga via PIX recorrente Asaas vê "fale com a gente no WhatsApp". Vamos remover essa fricção e fazer a troca rodar 100% no backend, sem intervenção humana e **sem cálculo de proporção** — o ciclo atual continua valendo até a próxima cobrança, e a partir daí o usuário já paga o novo plano.

## Como vai funcionar para o usuário

1. No `/meu-espaco`, usuário PIX clica em "Trocar plano" → abre o mesmo `ChangePlanDialog`, **sem** o bloco do WhatsApp.
2. Escolhe plano + ciclo → clica em "Confirmar troca".
3. Backend cancela a subscription Asaas atual e cria uma nova com o novo `value`/`cycle`, mantendo o **mesmo `nextDueDate`** da assinatura antiga (não cobra nada hoje).
4. UI mostra: "Plano trocado. Sua próxima cobrança PIX, no dia X, já vem no valor novo: R$ Y."

Simples. Sem QR code de ajuste. Sem crédito. Sem tabela nova.

## Mudanças

### 1. Nova edge function `change-asaas-plan`
- Input: `{ userId, targetPlan, billing }`
- Resolve `profile.asaas_customer_id`
- Busca subscription Asaas ativa em `asaas_payments` (último `asaas_subscription_id` com status ativo/overdue)
- Consulta a subscription antiga no Asaas (`GET /subscriptions/{id}`) pra extrair `nextDueDate`
- Chama Asaas API:
  - `POST /subscriptions` com novo `value`, `cycle` e `nextDueDate = nextDueDate antigo` (mesma data, valor novo)
  - `DELETE /subscriptions/{id antigo}` (cancela a antiga só depois que a nova foi criada com sucesso)
- Persiste em `profiles`: `plan`, `billing_cycle`, novo `asaas_subscription_id`
- Retorna `{ ok, newPlan, newPlanName, newBilling, nextChargeDate, nextChargeAmount }`
- Logs com prefixo `[CHANGE-ASAAS-PLAN]`, mensagens PT-BR amigáveis

### 2. UI — `ChangePlanDialog.tsx`
- Remover o early-return do bloco `isAsaasPix` (linhas que mostram "Falar no WhatsApp")
- Substituir prop `isAsaasPix?: boolean` por `paymentMethod: 'card' | 'pix'`
- Quando `paymentMethod === 'pix'`:
  - Header description muda: "A troca vale a partir da próxima cobrança PIX. Hoje não rola cobrança nenhuma."
  - Tela de confirmação: substitui "A diferença é cobrada agora no seu cartão..." por "Sua próxima cobrança PIX (dia X) já vem com o novo valor: R$ Y. Nada é cobrado agora."
  - `handleConfirm` invoca `change-asaas-plan` em vez de `change-subscription-plan`
  - Toast de sucesso: "Plano trocado. Próxima cobrança PIX no dia X."
- Reutiliza `PLAN_MONTHLY_EQUIVALENT` da `src/lib/plan-pricing.ts`

### 3. `UserPortal.tsx`
- Passar `paymentMethod` para o dialog em vez de `isAsaasPix` (mesma lógica de detecção atual)

### 4. `supabase/config.toml`
- Adicionar `[functions.change-asaas-plan] verify_jwt = false`

## Bordas tratadas

- **Mesmo plano + mesmo ciclo** → 409 "você já está nesse plano"
- **Subscription Asaas não encontrada** → 404 "não encontramos sua assinatura, tenta de novo"
- **Usuário em OVERDUE** → bloqueia troca: "tem cobrança pendente, paga ela primeiro" (link pro QR no portal)
- **Falha no `POST /subscriptions`** → não cancela a antiga, retorna 500 e mantém estado anterior
- **Falha no `DELETE` da antiga (após criar a nova)** → loga `[CHANGE-ASAAS-PLAN] WARN orphan old subscription` e segue (a nova já está ativa; admin limpa depois). Não bloqueia o usuário.
- **Sem `nextDueDate` na sub antiga** (caso raro) → usa `hoje + 30 dias` como fallback

## Detalhes técnicos

- **API Asaas**: `ASAAS_API_KEY` + `ASAAS_ENV` (já configurados como secrets)
- **Endpoints**: `GET /v3/subscriptions/{id}`, `POST /v3/subscriptions`, `DELETE /v3/subscriptions/{id}`
- **Validação de identidade**: portal usa token UUID; a edge valida cruzando `userId` recebido com `profiles.asaas_customer_id` antes de chamar Asaas (impede troca por terceiros)
- **Sem mudança no `change-subscription-plan` Stripe** — segue só para cartão
- **Sem nova tabela, sem migration**

## Fora de escopo

- Trocar de **PIX para cartão** ou vice-versa (continua sem fluxo automático — caso raro)
- Cobrança/crédito proporcional (decisão explícita: simplicidade > precisão de centavos)
- Testes automatizados (segue débito conhecido)
