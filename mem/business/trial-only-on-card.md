---
name: Trial semanal só no cartão
description: Trial pago de R$ 6,90/11,90/24,90 é exclusivo do cartão Stripe; PIX Automático Bacen sempre cobra valor cheio na 1ª parcela
type: feature
---
Regra de pagamento:
- Trial pago semanal (Essencial R$ 6,90, Direção R$ 11,90, Transformação R$ 24,90) só existe no CARTÃO via Stripe.
- PIX Automático Bacen (Asaas) NÃO tem trial: o 1º QR já cobra o valor cheio do plano e autoriza o débito recorrente.
- Tecnicamente o Bacen aceita `immediateQrCode.value` diferente do `value` recorrente, mas não usamos esse formato hoje (risco de reautorização por variação grande de valor + janela mínima Bacen de 2 dias antes do 1º débito recorrente).
- Quando lead pedir trial via PIX: ofereça (1) trial no cartão ou (2) PIX mensal cheio sem trial. Já refletido no SYSTEM_PROMPT de `supabase/functions/support-agent/index.ts` E no `recovery_agent_config.system_prompt` (recovery-agent). KB de ambos (`support_knowledge_base` e `recovery_knowledge_base`) também atualizadas.