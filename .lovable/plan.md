# Auditoria do dunning (2 avisos + escada) — 1 lacuna real

## O que está correto

- `_shared/dunning-whatsapp.ts`: tentativas 1 e 2 usam o template utility de aviso (`HXaf4a…`, link `/pagamento?t=`), tentativa 3 = 30% off, tentativa 4 = Lite, tentativa 5+ = `limit_reached`. Degrau "base" fora do WhatsApp.
- Contagem por ciclo: `invoice_id` → `payment_id` → `subscription_id`, contando só envios com `whatsapp_sent = true`, então template reprovado/undelivered não queima cota.
- Janela de marketing 08h–21h BRT aplicada só às ofertas; avisos saem a qualquer hora. Fora da janela, adia via `scheduled_tasks` sem gravar `dunning_attempts` — logo o dedup por `event_id` não bloqueia o envio adiado depois.
- `execute-scheduled-tasks` trata `dunning_offer_whatsapp` com `forceAttemptNumber` + `skipWindowCheck`, preservando o degrau calculado.
- Stripe: `invoice.payment_failed` chega uma vez por retry (Smart Retries, 4 tentativas) com o mesmo `invoice_id` → cadência completa 2 avisos + 2 ofertas por fatura.
- Asaas cartão recorrente: os 3 retries (D+2/D+4/D+7) chamam o helper com `eventId` distinto e o mesmo `paymentId` → avança 1→4.
- Rotas `/pagamento` e `/cancelar` existem no app.
- Não há segundo caminho concorrente enviando dunning por WhatsApp (`reprocess-dunning` é só e-mail).

## Lacuna encontrada (PIX Asaas)

No PIX (recorrente e PIX Automático) o único gatilho é `PAYMENT_OVERDUE`, com `eventId = asaas-PAYMENT_OVERDUE-<paymentId>`. O Asaas dispara esse evento uma vez por cobrança, e não existe retry agendado para PIX (o retry é só cartão). Resultado determinístico: o cliente PIX recebe **apenas o aviso 1** e nunca chega aos degraus de 30% e Lite. Ainda não há dado pós-mudança para observar (os últimos envios foram às 11:00 UTC de hoje, antes da alteração das 13:43), então a conclusão vem do código.

## Correção proposta

1. Em `webhook-asaas`, no bloco `PAYMENT_OVERDUE`, agendar uma cadência PIX em `scheduled_tasks` (novo `task_type: 'dunning_pix_followup'`) em D+2, D+4 e D+7, com payload `{ payment_id, subscription_id, customer_id }`. Idempotente: só agenda se não houver task pendente com o mesmo `payment_id`.
2. Em `execute-scheduled-tasks`, tratar `dunning_pix_followup`: antes de enviar, consultar o pagamento no Asaas; se estiver `RECEIVED`/`CONFIRMED`, cancelar o restante da cadência e não enviar. Caso siga em aberto, chamar `sendDunningWhatsApp` com o mesmo `paymentId` (sem `forceAttemptNumber`), deixando o helper calcular 2 → 3 → 4.
3. Atualizar a memória `mem://features/recovery/dunning-whatsapp` registrando a cadência PIX (D+2/D+4/D+7) e o cancelamento em caso de pagamento.

## Detalhes técnicos

- Arquivos: `supabase/functions/webhook-asaas/index.ts`, `supabase/functions/execute-scheduled-tasks/index.ts`, arquivo de memória.
- Nenhuma migração: `scheduled_tasks` já aceita `task_type` livre.
- O helper `dunning-whatsapp.ts` não muda — a contagem por `payment_id` já cobre o novo fluxo.
- Após a edição, redeploy de `webhook-asaas` e `execute-scheduled-tasks` (o `stripe-webhook` também precisa de redeploy para carregar o helper novo já alterado hoje).