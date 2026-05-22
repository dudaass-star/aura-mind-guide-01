## Resumo
Três mudanças no `/v2/checkout` (sem mexer no V1):

1. **Anual sem trial** — vira pagamento direto, sem 7 dias por R$ 9,90.
2. **Cartão recorrente em Trim/Sem/Anual** — assinatura Stripe com `interval_count` 3/6/12.
3. **PIX Automático (Asaas) em todos os períodos** — cliente autoriza 1x no banco, Asaas debita sozinho a cada ciclo. UX igual cartão.

> Pré-requisito do item 3: Pix Automático precisa estar habilitado na conta Asaas. Se não estiver, cai no fallback PIX QR recorrente (cliente recebe novo QR por email/WhatsApp a cada ciclo e paga manual).

## 1. Anual sem trial
- Remover branch `billingPeriod === "yearly"` que mostra CTA cartão+trial + CTA secundário PIX.
- Anual passa a ter mesmo layout de Trim/Sem: dois CTAs (PIX automático e cartão).
- `create-checkout` retorna 400 se `trial=true` + `billing=yearly`.

## 2. Cartão recorrente em Trim/Sem/Anual (Stripe)

### 9 preços novos
Recorrentes em BRL com `recurring: { interval: "month", interval_count: N }`:

| Plano | Trim (N=3) | Sem (N=6) | Anual (N=12) |
|---|---|---|---|
| Essencial | R$ 79,90 | R$ 125,90 | R$ 214,90 |
| Direção | R$ 133,90 | R$ 209,90 | R$ 359,90 |
| Transformação | R$ 213,90 | R$ 335,90 | R$ 574,90 |

Secrets: `STRIPE_PRICE_{ESSENCIAL|DIRECAO|TRANSFORMACAO}_CARD_{QUARTERLY|SEMESTRAL|YEARLY}`.

### `create-checkout`
- Aceita `billing ∈ {quarterly, semestral, yearly}` + `paymentMethod: "card"` + sem `trial`.
- `mode: "subscription"`, embedded, `payment_method_types: ["card"]`.
- Antidup atual continua valendo.

### `stripe-webhook`
- Subscription path já lida com `current_period_end`; só validar que funciona com `interval_count` > 1.
- `Purchase` Meta CAPI/GA4 no primeiro `invoice.payment_succeeded`.

### Frontend
- CTA secundário **"Pagar no cartão — R$ X a cada {trimestre|semestre|ano}"** (variant outline) abaixo do CTA PIX.
- Reusa fluxo embedded Stripe.

## 3. PIX Automático (Asaas) em Mensal/Trim/Sem/Anual

### Migration
```sql
ALTER TABLE asaas_payments ADD COLUMN asaas_subscription_id text NULL;
CREATE INDEX idx_asaas_payments_subscription ON asaas_payments(asaas_subscription_id);
```

### Nova edge `criar-pix-automatico-asaas`
- Input: `plan`, `billing`, `name`, `email`, `phone`, `cpf`.
- Cria/reaproveita customer Asaas.
- `POST /subscriptions` com:
  - `billingType: "PIX"` + `pixAutomatico: true` (parâmetro exato a confirmar no docs Asaas no build).
  - `cycle`: `MONTHLY | QUARTERLY | SEMIANNUALLY | YEARLY`.
  - `value`: preço do período.
  - `nextDueDate`: hoje BRT.
- Retorna URL de autorização do banco do cliente (ou QR de autorização única).
- Salva em `asaas_payments` com `asaas_subscription_id` e `status: AUTHORIZATION_PENDING`.

### Modal PIX (frontend)
- Substitui o QR atual por **link/QR de autorização única**: "Abra o app do seu banco, autorize a AURA a debitar R$ X a cada {período}. Só precisa fazer isso uma vez."
- Após autorização, Asaas dispara `PAYMENT_RECEIVED` e o webhook libera acesso.

### `webhook-asaas`
- `PAYMENT_RECEIVED` com `subscription` preenchido: 1ª liquidação → cria perfil + boas-vindas; renovações → estendem `subscription_expires_at` pelo período.
- `SUBSCRIPTION_DELETED` / autorização revogada pelo cliente → `canceled`.
- `PAYMENT_OVERDUE` persistente → `past_due`.

### Fallback automático
Se a edge `criar-pix-automatico-asaas` retornar erro de "Pix Automático não habilitado" ou banco do cliente não suportar, frontend cai automaticamente no PIX QR recorrente (subscription Asaas `cycle` sem flag automática, cliente paga QR manual a cada ciclo — fluxo descrito na versão anterior do plano).

### Frontend (CheckoutV2.tsx)
- Em todos os 4 períodos, CTA PIX principal vira **"Pagar com PIX Automático — R$ X/{período}"**.
- Copy modal: "Autorize uma vez no app do seu banco e a AURA renova automaticamente. Cancele quando quiser pelo WhatsApp."

## Fora de escopo
- V1, Smart Retries, Dunning, Customer Portal — intocados.
- Boleto, Stripe Link, Apple/Google Pay — fora.

## Pontos técnicos
- Idempotência webhook: `event.id` Stripe e `payment.id`/`subscription.id` Asaas como chave única.
- Antidup: checar assinatura ativa Stripe E Asaas para mesmo email/phone antes de criar nova.
- Asaas em produção — confirmado.

## Decisões pra confirmar antes do build
1. **Pix Automático habilitado na conta Asaas?** Se não estiver, implemento direto o fallback (PIX QR recorrente) e a gente liga o automático depois sem mexer no frontend.
2. **Criação dos 9 preços Stripe**: posso criar via tool no build, ou prefere criar no dashboard?
