## Objetivo

Corrigir o gap de eventos Purchase via CAPI para vendas PIX Asaas e disparar retroativamente os 2 eventos perdidos hoje (Felipe e Maria).

## Contexto

O `webhook-asaas` só dispara Purchase via CAPI dentro do branch `isNew` (linhas 570-607). Quando o `PAYMENT_RECEIVED` não consegue correlacionar a autorização PIX (porque `asaas_subscription_id` ficou vazio), a ativação cai em paths alternativos (`recovered-…` ou SQL manual) que **pulam o bloco de CAPI**. Resultado: a venda existe no banco, mas o Meta nunca recebe o evento.

Como o `ThankYou.tsx` desativou o Purchase no pixel do browser (linhas 13-15) deixando "server-side only", se o CAPI não dispara, **não há evento nenhum** — foi exatamente o que aconteceu hoje.

## Etapas

### 1. Backfill dos 2 eventos perdidos de hoje

Disparar manualmente via `meta-capi` os eventos Purchase para:
- Felipe (`5fbb7bbc…`) — R$ 49,90
- Maria (`5e50c12e…`) — R$ 29,90

Usando dados do `asaas_pix_authorizations` (fbp, fbc, email, telefone hash, event_time original) com `event_id` determinístico para permitir deduplicação caso a Meta receba duplicata futura.

### 2. Tornar o disparo de Purchase resiliente em `webhook-asaas/index.ts`

Mover (ou duplicar) o bloco de CAPI Purchase para **fora do branch `isNew`**, de modo que qualquer caminho que ative o usuário a partir de um `PAYMENT_RECEIVED` (incluindo `recovered-…` e ativação tardia) dispare o evento. Proteção contra duplicata:

- Gerar `event_id` determinístico a partir de `payment.id` do Asaas
- Checar `meta_capi_log` por `event_id` antes de enviar (skip se já enviado com `meta_status=200`)

### 3. Validação

- Conferir 2 novas linhas em `meta_capi_log` com `meta_status=200` e `source=webhook-asaas-backfill`
- Verificar no Meta Events Manager (Test Events ou Overview) que os 2 Purchase apareceram com os valores corretos
- Próxima venda PIX real: confirmar que `webhook-asaas` grava `meta_capi_log` mesmo se a correlação inicial falhar

## Arquivos afetados

- `supabase/functions/webhook-asaas/index.ts` — refator do bloco CAPI (item 2)
- Backfill ad-hoc via `supabase--curl_edge_functions` chamando `meta-capi` diretamente (item 1, sem mudança de código)

## Riscos

- **Duplicação no Meta**: mitigado pelo `event_id` determinístico (Meta dedupa por 7 dias)
- **Regressão no fluxo `isNew`**: a lógica atual continua, só adicionamos o fallback fora dela
