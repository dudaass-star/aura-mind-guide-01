## Estado atual

SIDs recebidos:
- `dunning_offer_30` → `HX50cb75b6bb3cd9ae56ef2d9c6adc4781`
- `dunning_offer_lite` → `HX18e81fa401b8487c360f085e9b83630f`
- `dunning_offer_base` → **pendente** (você optou por esperar)

Contrato de variáveis dos dois já criados: `{{1}}` = primeiro nome no corpo; `{{2}}` = query string do botão (URL `https://olaaura.com.br/cancelar?{{2}}`).

## O que será implementado (quando o 3º SID chegar)

**1. Registro dos templates**
Inserir os 3 templates em `whatsapp_templates` com nome, ContentSid, categoria `marketing` e contagem de variáveis = 2.

**2. Seleção de tier por tentativa em `_shared/dunning-whatsapp.ts`**
- Tentativa 1 → `dunning_offer_30` (query `t=<token>&offer=discount_30`)
- Tentativa 2 → `dunning_offer_lite` (`offer=lite`)
- Tentativa 3 → `dunning_offer_base` (`offer=base`)
- Elevar `DUNNING_MAX_ATTEMPTS` de 2 para 3, já que agora cada envio carrega uma oferta diferente (hoje o limite é 2 e os dois envios usam o mesmo template genérico de falha).
- Passar `{{2}}` como query string completa; manter o token vindo de `ensurePortalToken`.
- Registrar em `dunning_attempts` o `template_sid` do tier disparado (coluna já existe).

**3. Janela de envio (categoria Marketing)**
Como os 3 templates são Marketing e não Utility, restringir disparo à faixa 08h–21h BRT. Fora da janela, agendar/adiar em vez de enviar. O template atual de dunning puro (`HXaf4af1e1f5d4cf40b6fff6b5b68df29a`) continua sem essa restrição.

**4. Landing `/cancelar` com `?offer=`**
`CancelSubscription.tsx` passa a ler o parâmetro `offer` e destacar o card correspondente (`discount_30`, `lite`, `base`), com o restante da escada visível abaixo. Sem `offer`, comportamento atual inalterado.

## Detalhes técnicos

- Gatilhos que chamam `sendDunningWhatsApp` (`stripe-webhook` em `invoice.payment_failed` e `webhook-asaas` em `PAYMENT_OVERDUE`) não mudam — a escolha do tier fica dentro do helper, baseada no `attemptNumber` já calculado ali.
- Idempotência por `(profile_user_id, event_id, channel='whatsapp')` permanece.
- Deploy das edge functions afetadas ao final.

## Antes de implementar

Preciso do ContentSid do `dunning_offer_base`. Assim que mandar, executo os 4 itens numa passada só.
