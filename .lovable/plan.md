## Faz sentido — a reclamação do Meta é legítima

O Eventos Manager está certo. Hoje a gente dispara `Lead` e `InitiateCheckout` (no pixel do browser e na CAPI) só com `content_name` e `content_category` — sem `value` nem `currency`. Por isso 100% dos eventos aparecem como "moeda ausente". Sem isso, o Meta não consegue calcular ROAS nem otimizar campanhas de Conversão por valor.

Mesma coisa no `ViewContent` da Index/IndexV2/Checkout (não está na reclamação porque sem PII a CAPI pula, mas o pixel browser também tá sem valor).

## O que fazer

Adicionar `value` (em BRL, número) e `currency: "BRL"` em todos os eventos de funil pré-compra.

### Tabela de valores

| Evento | Página | value | currency |
|---|---|---|---|
| ViewContent | `/` (Index, IndexV2) | `6.90` (entry-level / âncora do trial Essencial) | BRL |
| ViewContent | `/checkout`, `/v2/checkout` | preço do plano selecionado no momento (trial: 6.9 / 9.9 / 19.9) | BRL |
| Lead | `/checkout`, `/v2/checkout` | preço do plano selecionado (trial) | BRL |
| InitiateCheckout | `/checkout`, `/v2/checkout` | preço do plano selecionado (trial) | BRL |

Observação: a página de checkout hoje é só fluxo trial pago (6,90/9,90/19,90). Quando o usuário troca de plano, o `value` no `InitiateCheckout` do submit já reflete a escolha. Pro `ViewContent` on-mount usamos o `selectedPlan` inicial (default `direcao` → 9.9, conferir no arquivo).

## Arquivos a alterar

1. **`src/pages/CheckoutV2.tsx`**
   - `ViewContent` (linha ~93): adicionar `value: trialPriceMap[selectedPlan], currency: "BRL"`
   - `Lead` browser pixel (linha ~199): idem
   - `InitiateCheckout` browser pixel (linha ~205): idem
   - `capiPayload.custom_data` (linha ~216): adicionar `value` e `currency`

2. **`src/pages/Checkout.tsx`**
   - `ViewContent` (linha ~86): adicionar `value` (do `selectedPlan` no mount) e `currency: "BRL"`
   - `Lead` e `InitiateCheckout` browser pixel (linhas ~197 e ~201): idem
   - `capiPayload.custom_data` (linha ~211): idem

3. **`src/pages/Index.tsx`** e **`src/pages/IndexV2.tsx`**
   - `ViewContent` no mount: adicionar `value: 6.90, currency: "BRL"` (âncora trial mais barato — usuário ainda não escolheu plano)

4. **`supabase/functions/meta-capi/index.ts`**
   - Não precisa mexer: já encaminha `custom_data.value` e `custom_data.currency` se vierem no payload. Só garantir tipagem do `value` como number (já tá).

## Como o Meta vai ler

- Pixel browser e CAPI vão ter o mesmo `event_id` + agora `value`+`currency` → dedup mantido + ROAS calculável.
- Em ~24h o aviso no Eventos Manager some.

## Fora do escopo

- Não mexer no `Purchase` (já é disparado pelo Stripe webhook com value correto, presume-se — vale auditar em outro momento se aparecer aviso lá também).
- Não mexer em GA4 (já tem value nos eventos `begin_checkout` / `add_payment_info`).
- Não alterar lógica de negócio, preços ou copy.
