

## Correção: Trial pago deve disparar Purchase no Meta

### Situação atual

No fluxo de trial pago (`trial_validation=true`), o stripe-webhook dispara apenas o evento **StartTrial** (linha 346). O evento **Purchase** só existe no fluxo de checkout normal (linha 577), que não é mais usado.

Como todo checkout atual passa pelo trial pago, o Meta não recebe nenhum evento Purchase há 5 dias.

### Correção

**Arquivo: `supabase/functions/stripe-webhook/index.ts`**

Adicionar um disparo de **Purchase** logo após o StartTrial no bloco de trial validation (após linha 365), usando o valor real pago (`session.amount_total / 100` — R$ 6,90 / 9,90 / 19,90):

- `event_name: 'Purchase'`
- `event_id`: usar sufixo diferente do StartTrial para deduplicação (ex: `session.id + '_purchase'`)
- `value`: `session.amount_total / 100`
- `currency: 'BRL'`
- Mesmos `user_data` (email, phone, first_name, fbp, fbc)
- `event_source_url: 'https://olaaura.com.br/obrigado'`

Isso garante que cada pagamento de trial gera tanto StartTrial quanto Purchase no Meta, permitindo otimização de campanhas por compra.

**Escopo**: ~20 linhas adicionadas em 1 arquivo. Sem migration.

