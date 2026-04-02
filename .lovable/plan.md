

## Correção do Dunning Falhado — 3 Clientes de 02/04

### Problema

O webhook do Stripe processou 3 eventos `invoice.payment_failed` hoje, mas **não executou o fluxo de dunning** para nenhum deles. Zero registros em `dunning_attempts`, zero atualizações de `payment_failed_at` nos perfis. Os logs foram rotacionados, impedindo diagnóstico exato.

### Plano em 2 Passos

**Passo 1: Recuperação imediata**

Usar a função `reprocess-dunning` já existente para enviar as mensagens de dunning manualmente para os 3 customers:
- `cus_UDWIwTAvUFRlO2` (Niédja Alcântara)
- `cus_UDUaYL9Yg9vXP1` (Rafaella Gomes)
- Identificar o 3º customer via Stripe invoice e incluir

Chamar a edge function `reprocess-dunning` com os 3 customer_ids.

**Passo 2: Diagnóstico e correção do webhook**

Adicionar logging extra no início do bloco `invoice.payment_failed` do stripe-webhook para capturar:
- Se o bloco está sendo alcançado
- Se `invoice.subscription` está null (o que pularia todo o dunning)
- O customer_id e email sendo usado na resolução

Adicionar um log de entrada no início do bloco de dunning e um try/catch mais robusto para garantir que ao menos o registro de auditoria seja criado mesmo em caso de crash.

**Arquivo**: `supabase/functions/stripe-webhook/index.ts` — adicionar console.log de entrada no bloco payment_failed e garantir fallback de audit trail.

### Detalhes Técnicos

- O bloco de dunning (linha 876) verifica `if (invoice.subscription)` — se for null, pula silenciosamente sem criar nenhum registro de auditoria. Este é um possível gap.
- O `reprocess-dunning` resolve perfis independentemente, então pode funcionar mesmo quando o webhook falha.
- Deploy necessário: `stripe-webhook` (com logs extras) + execução manual de `reprocess-dunning`.

