# Auditoria da recuperação por WhatsApp — o que já funciona e os 4 ajustes que faltam

Verifiquei o código e os dados reais dos últimos 30 dias. As correções da rodada anterior estão no repositório e o win-back voltou a rodar (1 envio real hoje, 07/08 15:57 BRT, cron diário ativo às 10h BRT). Mas os dados mostram quatro pontos que ainda deixam cliente sair sem receber nada.

## O que está confirmado como OK

- `winback-canceled-users` boota (import corrigido), cron `winback-canceled-users-daily` ativo, 1 envio gravado em `profiles.winback_d3_sent_at`.
- Escada de 2 avisos + ofertas está no código; o último envio (07/08) já usou o degrau correto (aviso genérico no attempt 1, Lite no attempt 4).
- Fallback do Stripe (`parent.subscription_details.subscription`) está no `stripe-webhook` e é usado antes de desistir.

## Ajuste 1 — Aviso genérico nunca foi entregue (mais grave)

Nos últimos 7 dias, todo envio do template de aviso `HXaf4af...` falhou com **ErrorCode 63027** da Twilio (2 de 2). Os templates de oferta (30% off e Lite) foram entregues normalmente. Ou seja: quem cai em dunning hoje não recebe os avisos 1 e 2 — só recebe algo se chegar ao degrau 3.

A causa exata não está confirmada pelos dados. Plano: consultar o template no Content API da subconta de recuperação e comparar número de variáveis/aprovação Meta com os templates que funcionam, e só então corrigir (ajuste de variáveis ou troca por um ContentSid aprovado). Enquanto o aviso não estiver entregável, usar como fallback imediato o template de oferta já aprovado para não deixar o ciclo silencioso — decisão só depois do diagnóstico.

## Ajuste 2 — Renovação sem assinatura resolvida sai sem nenhuma tentativa

Ainda hoje (07/08 10:42 BRT) e em 06/08 houve `no_subscription_on_invoice` (19 no total no mês). Nesses casos o webhook grava a auditoria e retorna: nenhum WhatsApp, nenhum e-mail — mesmo havendo `hosted_invoice_url` e telefone/e-mail no cliente Stripe.

Correção: antes de sair desse branch, rodar o modo degradado (WhatsApp com link da fatura + e-mail secundário), já que recuperar pagamento não depende de conhecer o `subscription_id`.

## Ajuste 3 — Modo degradado nunca disparou de fato

`dunning_attempts` tem 80 registros `profile_not_found` (último hoje 03:11 BRT) e **zero** linhas de WhatsApp em modo degradado. Precisa de um teste ponta a ponta com um evento real reprocessado para confirmar se o caminho novo dispara, e ajustar o que estiver travando (link curto, telefone sem DDI, ausência de nome).

## Ajuste 4 — `offer_tier` não está sendo gravado

Nenhuma linha da tabela tem `offer_tier` preenchido, inclusive o envio de hoje. A coluna existe, então o helper que grava o degrau ainda não está na versão publicada das funções. Redeploy das funções que importam o helper (`stripe-webhook`, `webhook-asaas`, `execute-scheduled-tasks`, `webhook-twilio-recovery`) e conferência de que o próximo envio grava generic/discount_30/lite.

## Detalhes técnicos

- `supabase/functions/stripe-webhook/index.ts` (~linha 1306): mover o `return` do branch `no_subscription_on_invoice` para depois de uma chamada a `sendDunningWhatsAppDegraded` + e-mail.
- Diagnóstico 63027: leitura do Content API na subconta `TWILIO_RECOVERY_*` (`/v1/Content/HXaf4af...`) e comparação com `HX18e81f...`/`HX50cb75...`; conferir contagem de variáveis ({{1}}, {{2}}) e status de aprovação.
- Teste do degradado: reprocessar um evento com `reprocess-dunning` para um caso `profile_not_found` recente e ler `dunning_attempts` (`profile_found=false`, `channel='whatsapp'`).
- Redeploy do `_shared/dunning-whatsapp.ts` via as funções consumidoras; validar `offer_tier` no próximo registro.
- Sem mudanças de schema.

## Ordem

1. Diagnóstico + correção do template de aviso (63027).
2. Modo degradado no branch sem assinatura.
3. Redeploy e validação de `offer_tier`.
4. Teste ponta a ponta do degradado com evento real.
