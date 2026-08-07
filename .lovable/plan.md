# Dunning: o que está funcionando e o buraco real

## Resumo em uma frase

O dunning funciona para quem tem perfil no nosso banco (2 avisos → 30% → Lite, e-mail + WhatsApp), mas **um terço dos clientes que param de pagar não recebe absolutamente nada** porque o webhook aborta quando não encontra perfil — inclusive o e-mail, que não depende de perfil.

## O que está comprovadamente funcionando

- **Cadência de 2 avisos + escada** no cartão (Stripe) e no PIX/cartão Asaas: nos últimos dias há registros com `attempt_number` 1, 2, 3 e 4 entregues.
- **E-mail de dunning**: 57 `dunning-payment-failed` enviados em 30 dias (25 suprimidos por descadastro/bounce).
- **Recuperação de checkout por e-mail**: 3 estágios rodando (32 / 29 / 21 envios).
- **Adiamento de janela de marketing**: 16 tarefas `dunning_offer_whatsapp` executadas (ofertas fora de 08h–21h BRT são reagendadas).
- **Cadência PIX**: 2 tarefas `dunning_pix_followup` pendentes, próxima em 11/08.
- **Escada de cancelamento em /cancelar**: 5 aplicações, com 1 aceite de Lite e 1 de Base.

## As 4 falhas encontradas

### 1. `profile_not_found` mata todo o dunning — 44 casos em 14 dias (a maior perda)
Quando o telefone do cliente no gateway não casa com nenhum perfil, o webhook grava a auditoria e **retorna, sem enviar e-mail**, mesmo tendo o e-mail do cliente na mão.

Casos reais confirmados no Stripe: um cliente do plano Direção (R$ 49,90) acumulou 8 falhas de pagamento e teve a assinatura **cancelada por `payment_failed` sem receber uma única mensagem**. Há pelo menos 12 clientes distintos nessa situação nas últimas 3 semanas.

Correção: quando não houver perfil, ainda assim enviar o e-mail de dunning (o e-mail vem do gateway e o link de pagamento é o Billing Portal, que também não depende de perfil). O WhatsApp continua exigindo perfil — é ele que guarda o telefone confiável e o token do portal.

### 2. `no_subscription_on_invoice` — 7 casos: aborta antes de qualquer aviso
Faturas de primeira cobrança sem assinatura resolvida encerram o fluxo. Para faturas de renovação isso é perda; para tentativas de compra que nunca viraram assinatura, o certo é continuar caindo na recuperação de checkout e não no dunning. Correção: separar os dois casos por `billing_reason` e, na renovação, seguir para o e-mail mesmo sem `subscription_id`.

### 3. `offer_tier` nunca é gravado — auditoria cega
280 tentativas, zero com `offer_tier` preenchido. O helper decide o degrau (`generic` / `discount_30` / `lite`) e não persiste. Sem isso não é possível responder "quantos receberam a oferta de 30%?" nem medir aceite por degrau. Correção: gravar `offer_tier` e `days_past_due` em todo insert de `dunning_attempts`.

### 4. Falhas de entrega Twilio (ErrorCode 63027) — 3 em 14 dias
O envio é aceito, mas o callback de status marca falha. Hoje isso só vira linha de erro; ninguém é notificado nem há fallback. Correção: quando o WhatsApp falhar na entrega, garantir que aquele degrau seja reenviado no próximo ciclo (a cota já não é queimada) e expor essas falhas no painel.

## Escopo técnico

- `supabase/functions/stripe-webhook/index.ts`: no ramo `invoice.payment_failed`, transformar os `return` de `profile_not_found` e `no_subscription_on_invoice` em caminho degradado que ainda envia `dunning-payment-failed` com o e-mail do customer e o link do Billing Portal; manter a auditoria com um `error_stage` novo (`profile_not_found_email_only`).
- `supabase/functions/webhook-asaas/index.ts`: mesma regra para cobrança PIX/cartão sem perfil resolvido, usando o link de fatura Asaas.
- `supabase/functions/_shared/dunning-whatsapp.ts`: persistir `offer_tier` e `days_past_due` em todos os inserts.
- `src/pages/AdminEngagement.tsx`: no bloco de dunning, exibir distribuição por degrau (aviso 1, aviso 2, 30%, Lite) e uma linha separada para "sem perfil (só e-mail)" e "falha de entrega Twilio".

## Fora de escopo

Não vou mexer na escada de ofertas, nos valores, nos templates aprovados, na janela 08h–21h nem na cadência PIX — tudo isso está funcionando como desenhado.
