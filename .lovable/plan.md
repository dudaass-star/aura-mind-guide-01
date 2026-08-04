# Verificação dos links de dunning (pagamento, desconto, planos baratos)

## Resultado da conferência

Confirmado no código e no banco:

- **Aviso (tentativas 1 e 2)** → `https://olaaura.com.br/pagamento?t=<token>`. A rota existe e resolve via `customer-portal`: cartão Stripe abre o Billing Portal; cartão Asaas abre a fatura em aberto (`OVERDUE`/`PENDING`, com fallback pela mais recente); PIX sem customer Stripe abre a fatura Asaas em aberto. O template `HXaf4af1...` (utility, 2 variáveis) já está cadastrado em `whatsapp_templates` como `dunning_notice`.
- **Oferta 30% (cartão, tentativa 3)** → botão `https://olaaura.com.br/cancelar?t=<token>&offer=discount_30`, SID `HX50cb75...` cadastrado.
- **Oferta Lite (tentativa 4 no cartão, tentativa 3 no PIX)** → `...&offer=lite`, SID `HX18e81f...` cadastrado.
- **Base (R$ 9,90)** → sem template de WhatsApp por decisão de escada; aparece só dentro de `/cancelar`, e a página aceita `discount_30 | lite | base`.
- **PIX pula o 30%** (`DUNNING_OFFER_LADDER_PIX`) e o `payment_method` é propagado do `webhook-asaas` para o `execute-scheduled-tasks` e para o helper, então a escada certa é escolhida em cada cadência.

## Duas inconsistências que sobraram

### 1. PIX agenda 4 disparos para uma escada de 3 degraus
O `webhook-asaas` cria follow-ups em D+2, D+4 e D+7. Somando o envio do `PAYMENT_OVERDUE`, dão 4 tentativas, mas o teto do PIX é 3 (2 avisos + Lite). A tarefa de D+7 sempre cai em `limit_reached` e não envia nada.
Ajuste: no PIX, agendar apenas D+2 e D+4; manter o terceiro degrau só para métodos com escada de 2 ofertas (cartão).

### 2. Ex-cliente de cartão que hoje paga PIX pode cair no Billing Portal
No `customer-portal`, a busca por customer do Stripe (email/telefone) vem antes do fallback Asaas. Quem já teve assinatura no cartão e migrou pro PIX tem customer no Stripe e é levado a um portal sem cobrança em aberto.
Ajuste: quando existir cobrança Asaas em aberto (`OVERDUE`/`PENDING`) para o usuário, priorizar essa fatura antes de tentar o Stripe.

## Ainda não observável na prática
Os últimos envios em `dunning_attempts` (hoje, 08:00 BRT) são anteriores à republicação das funções, por isso ainda mostram o template de 30% na tentativa 1. A confirmação de que a tentativa 1 grava `HXaf4af1...` precisa de um envio de teste depois dos ajustes.

## Notas técnicas
- Arquivos: `supabase/functions/webhook-asaas/index.ts` (agendamento PIX) e `supabase/functions/customer-portal/index.ts` (ordem de roteamento).
- Contrato de link permanece igual: `/pagamento?t=` e `/cancelar?t=&offer=`.
- Depois do ajuste: redeploy de `webhook-asaas` e `customer-portal` e um envio de teste de dunning para conferir `attempt_number = 1` com o SID de aviso.