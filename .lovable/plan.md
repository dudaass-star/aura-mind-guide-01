Auditei o fluxo Asaas ponta-a-ponta. Resposta direta: **não vai funcionar 100% como está — tem 2 bugs críticos que quebram o principal, e alguns menores.** Segue o plano de correção, priorizado.

## 🔴 Bugs críticos (bloqueiam o produto)

### 1. Retry automático de cartão NUNCA dispara

`webhook-asaas/index.ts:488` compara `payment_method === "CREDIT_CARD"`, mas o valor gravado é `"CREDIT_CARD_RECURRING"` (`criar-cartao-asaas` linhas 261/298). Resultado: os retries D+2/D+4/D+7 e o auto-cancel no 3º fail — que a gente acabou de implementar — **estão mortos**. Nenhum cliente OVERDUE de cartão Asaas é recuperado.

- Fix: `pm === "CREDIT_CARD_RECURRING"` (ou `startsWith`).

### 2. Falso "Pagamento aprovado" no checkout recorrente

`criar-cartao-asaas/index.ts:318` lê `asaasResp.status` da **subscription** (ACTIVE/INACTIVE), não do **payment** (CONFIRMED/AWAITING_RISK_ANALYSIS/DECLINED). Uma sub recém-criada quase sempre nasce `ACTIVE` mesmo com a 1ª cobrança recusada ou em análise → o form mostra "Pagamento aprovado" e manda pro `/obrigado` mesmo com cartão negado.

- Fix: ler `payments.data[0].status` (já buscado na linha 259-260, só descartado hoje) e usar ele como fonte da verdade pra `success` e pra decidir se mostra tela de análise.

### 3. Trial mensal cobra valor cheio (risco CDC)

Copy do checkout: "Começar trial por R$ 6,90". Backend Asaas (`criar-cartao-asaas:134`): cobra `PRICES[plan][monthly]` = R$ 29,90 imediatamente, sem `value` de trial nem `nextDueDate` deslocado. Diferente do Stripe que respeita o trial.

- Fix: 1ª parcela com `value: trialPrice` + `nextDueDate = hoje+7` no Asaas subscription, **ou** esconder copy de trial quando `card_gateway==="asaas"`. Decisão de produto (ver perguntas abaixo).

## 🟡 Bugs importantes

### 4. Eventos de risk analysis sem handler

`PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS` não estão no `statusMap` (`webhook-asaas:154`). A tela promete "avisamos no WhatsApp quando aprovar" — mas nenhum código dispara essa notificação. Recusado por antifraude fica invisível.

- Fix: mapear os 3 eventos → aprovado chama `handleActivation`; recusado dispara WhatsApp/email de recusa (pode reusar `dunning-payment-failed` com copy adaptada, ou criar template dedicado).

### 5. Silêncio em falha de insert de `asaas_payments`

`criar-cartao-asaas:304` só faz `console.warn` se o INSERT falhar. Sem esse registro, o webhook não encontra o `asaas_payment_id` e cai em "pagamento não vinculado" — cliente paga e nunca é ativado.

- Fix: falha explícita + alerta em `failed_message_log` (ou tabela equivalente).

### 6. Inconsistência `semestral` vs `semiannual`

Checkout usa `"semestral"`, ChangePlanDialog usa `"semiannual"`. Highlight de "plano atual" no portal quebra pra clientes semestrais.

- Fix: padronizar em `"semiannual"` em todo o fluxo Asaas (ou normalizar na leitura).

## 🟢 Menores (não bloqueiam)

- **#7** Erros do Asaas expostos crus em PT/EN misturado no toast. Traduzir os mais comuns (invalid CVV, declined, expired, etc).
- **#8** `card_retry_asaas` sem chave de idempotência no lado Asaas. Baixo risco (dedup local por `paymentId` já protege), mas dá pra adicionar `externalReference` com hash.
- **#9** `installmentMax=12` fixo, sem validar valor mínimo por parcela.

## ❓ Preciso da tua decisão em 2 pontos antes de codar

**A. Trial no Asaas (bug #3):**

- (i) Implementar trial real no Asaas (1ª cobrança R$ 6,90 hoje, R$ 29,90 recorrente a partir de D+7). Mais fiel ao Stripe. SIM
- (ii) Remover o trial da UX quando `card_gateway=asaas` — mostra só "R$ 29,90/mês, cancele quando quiser". Mais simples e sem risco jurídico. SIM

**B. UX pós-checkout recorrente (bug #2):**

- (i) Sempre mostrar "Pagamento em processamento, avisamos no WhatsApp" pra cartão recorrente Asaas e só liberar `/obrigado` quando webhook confirmar. Mais seguro, evita falso positivo.
- (ii) Ler o status real da 1ª cobrança e só mostrar sucesso se `CONFIRMED/RECEIVED`; `AWAITING_RISK_ANALYSIS` → tela de análise; qualquer outro → toast de erro. Comportamento mais próximo do Stripe.

## Escopo da implementação (após tuas respostas)

1. Patch em `webhook-asaas/index.ts`: fix #1 (payment_method match), fix #4 (3 novos eventos risk analysis), fix #6 (semiannual).
2. Patch em `criar-cartao-asaas/index.ts`: fix #2 (usar status da 1ª cobrança), fix #3 (conforme decisão A), fix #5 (falha explícita no insert), fix #6.
3. Patch em `AsaasCardForm.tsx` / `CheckoutV2.tsx`: fix #2 UX (conforme decisão B), fix #7 (tradução de erros comuns), fix #3 UX (conforme decisão A).
4. Patch em `change-asaas-plan/index.ts` + `ChangePlanDialog.tsx`: fix #6 (semiannual).
5. Sem migration necessária — tudo é código de edge function e frontend.

## O que já está OK (não mexo)

Preços/ciclos batendo entre 3 lugares, feature flag `card_gateway` com fallback correto, tokenização buscada ao vivo (nunca dessincroniza), idempotência de retry (uma vez que ele passe a disparar), dedup de Meta CAPI, autenticação de webhook, bloqueio de troca em installment/overdue.