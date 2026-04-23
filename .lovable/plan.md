

# Reduzir falhas de cobrança recorrente — sem 3DS, foco em CIT→MIT + auditoria

## Escopo desta rodada
3DS fica de fora. Vamos atacar a **causa estrutural** (fluxo de trial fragmentado em dois objetos Stripe) + ganhar **visibilidade real** dos motivos de recusa antes de qualquer outra mudança.

---

## Frente 1 — Unificar trial em Subscription nativa (a mudança que mais importa)

### Como é hoje
```
Checkout(mode=payment) → cobra R$ 6,90 (PaymentIntent isolado)
        ↓
stripe-webhook detecta metadata.trial_validation
        ↓
Cria Subscription separada com trial 7d
        ↓
7 dias depois → 1ª invoice de R$ 29,90 (mandato "novo" do ponto de vista do banco)
        ↓
Banco: "transação suspeita, recuso" → do_not_honor
```

### Como fica
```
Checkout(mode=subscription)
   ├── trial_period_days: 7
   ├── add_invoice_items: [{ unit_amount: 690 }]   ← cobra R$ 6,90 já
   └── payment_method_collection: 'always'
        ↓
1 único objeto Subscription criado já com mandato MIT_recurring + network_transaction_id
        ↓
7 dias depois → invoice de R$ 29,90 herda o mesmo mandato
        ↓
Banco: "continuidade de contrato autorizado" → aprova
```

### Arquivos
- `supabase/functions/create-checkout/index.ts` — refatorar bloco `if (trial)`:
  - Trocar `mode: "payment"` por `mode: "subscription"`
  - Adicionar `subscription_data: { trial_period_days: 7, add_invoice_items: [...], trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } }`
  - Criar Product/Price ad-hoc para o item de trial (R$ 6,90 / 9,90 / 19,90) via `price_data` em `add_invoice_items`
  - Manter `payment_method_collection: 'always'` e `payment_method_types: ['card']`
  - Adicionar `metadata.trial_unified: "true"` para distinguir do fluxo antigo
  - **Manter `request_three_d_secure: 'automatic'`** (sem mudança de 3DS conforme pedido)

- `supabase/functions/stripe-webhook/index.ts` — adaptar handler:
  - Detectar `metadata.trial_unified === "true"` em `checkout.session.completed`
  - **Pular** o bloco antigo de criar Subscription (já vem pronta do Checkout)
  - Continuar disparando welcome WhatsApp/email normalmente
  - **Manter compatibilidade** com fluxo antigo (`metadata.trial_validation`) para checkouts em andamento

### Compatibilidade & rollback
- Fluxo antigo continua funcionando para sessões já criadas
- Se algo der errado, basta reverter `create-checkout` — webhook aceita ambos
- Sem migration de DB necessária

---

## Frente 2 — Auditoria de `decline_code` (visibilidade)

Sem dados, qualquer mudança vira chute. Esta função vai mostrar **exatamente** quais bancos e quais códigos estão recusando.

### Nova edge function `audit-decline-codes`
- Lista invoices `status:'open'` ou `status:'uncollectible'` dos últimos 30 dias
- Para cada uma, expande `charge.outcome` e pega:
  - `decline_code` (`do_not_honor`, `insufficient_funds`, `transaction_not_allowed`, `card_velocity_exceeded`, etc.)
  - `network_status`
  - BIN do cartão (primeiros 6 dígitos → identifica banco emissor)
  - `card.brand` (Visa/Master/Elo/Hipercard)
- Agrupa e retorna ranking JSON:
```json
{
  "total_failed": 47,
  "by_decline_code": { "do_not_honor": 28, "insufficient_funds": 12, ... },
  "by_bank_bin": { "515104 (Itaú)": 9, "636368 (Nubank)": 7, ... },
  "by_brand": { "visa": 25, "mastercard": 18, "elo": 4 },
  "actionable_insight": "60%+ do_not_honor → indica problema MIT/3DS, não saldo"
}
```

### Arquivos
- `supabase/functions/audit-decline-codes/index.ts` [NOVO]
- `supabase/config.toml` [+1 bloco `verify_jwt = false`]

### Como rodar
- Manualmente via `supabase.functions.invoke('audit-decline-codes')` no console admin OU
- Acrescentar botão "Auditar recusas" em `/admin/engagement` (opcional, pode ficar pra próxima)

---

## Frente 3 — Checklist Dashboard Stripe (operacional, sem código)

Você precisa validar manualmente no painel Stripe:

| Item | Onde | Valor recomendado |
|---|---|---|
| Statement descriptor | Settings → Public details | `OLAAURA` (curto, sem acento) |
| Statement descriptor (shortened) | Same | `AURA` |
| MCC | Settings → Public details → Industry | `5968` (Continuity/Subscription) ou `8299` (Educational Services) |
| Smart Retries | Billing → Revenue recovery | ON, 4 tentativas |
| Card Account Updater | Settings → Payments | ON |
| Network Tokens | Settings → Payments | ON |
| Adaptive Acceptance | Settings → Payments | ON |

Após implementar e validar dashboard, deixar rodando 14–21 dias e comparar.

---

## Arquivos afetados

```text
supabase/functions/create-checkout/index.ts         [MODIFICAR — bloco trial]
supabase/functions/stripe-webhook/index.ts          [MODIFICAR — detectar trial_unified]
supabase/functions/audit-decline-codes/index.ts     [NOVO]
supabase/config.toml                                [+1 bloco verify_jwt]
```

## Riscos & mitigações

- **Mudança no fluxo de trial pode quebrar funis em andamento**: mantida compatibilidade dupla no webhook (`trial_validation` antigo + `trial_unified` novo). Sessões já criadas não são afetadas.
- **Sem 3DS, ainda haverá recusas**: aceito conscientemente — vamos medir o impacto isolado da unificação CIT→MIT primeiro. Se taxa não melhorar suficiente em 14–21d, retomamos a frente de 3DS com dados em mãos.
- **`add_invoice_items` cria invoice imediata cobrada na hora**: comportamento desejado (R$ 6,90 cobrado no ato, igual hoje). Trial só conta para a recorrência, não para o item avulso.
- **`attach-checkout-payment-methods` pode ficar redundante** para novos checkouts unificados: mantida funcionando para legado; podemos remover depois de 30d sem uso.

## Validação pós-deploy

1. **Smoke test imediato**: fazer 1 checkout de teste com cartão real → verificar no Stripe que existe **1 Subscription** (não Subscription + PaymentIntent separado) com 1 invoice paga de R$ 6,90 + trial de 7 dias ativo.
2. **Rodar `audit-decline-codes` agora** para ter baseline dos últimos 30 dias.
3. **Re-rodar `audit-decline-codes` em 14 dias**: comparar % de `do_not_honor` antes vs depois.
4. **Métrica-chave**: taxa de aprovação da 1ª cobrança pós-trial (R$ 29,90/49,90/79,90).
   - Hoje (estimado): ~60%
   - Meta sem 3DS: 70–75%
   - Meta com 3DS adicionado depois: 80–85%

