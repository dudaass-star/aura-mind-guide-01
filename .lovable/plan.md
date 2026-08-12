# Cobrança imediata ao atualizar forma de pagamento

Hoje, quando o cliente cadastra um cartão novo (portal de cobrança), o Stripe só tenta cobrar na próxima tentativa agendada da régua (no caso do Geová, amanhã ~12h BRT). Isso é ruim: o cliente acha que já resolveu, mas continua `past_due` por horas ou dias. Vamos cobrar na hora.

## 1. Caso Geová (agora)
- Forçar a cobrança da fatura aberta de R$ 79,90 no cartão novo (Visa •3958).
- Se entrar: normalizar o perfil (`status` correto, limpar `payment_failed_at`), encerrar a régua de dunning dele e registrar o evento de recuperação.
- Se recusar: manter na régua e registrar o motivo.

## 2. Cobrança imediata quando o cliente troca o método (Stripe/cartão)
Novo comportamento no webhook do Stripe, tratando três gatilhos:
- `payment_method.attached`
- `customer.updated` (quando muda o método padrão)
- `setup_intent.succeeded`

Ao receber qualquer um deles:
1. Definir o novo método como padrão do cliente e da assinatura (hoje isso só acontece no checkout inicial).
2. Buscar faturas abertas/`past_due` do cliente e tentar pagar imediatamente com o método novo.
3. Se pagar: reativar acesso, atualizar o perfil, cancelar as tarefas de dunning pendentes daquele usuário e mandar a confirmação no WhatsApp.
4. Se falhar: não mandar aviso extra (mantém a régua silenciosa atual) e apenas logar.

Proteções: idempotência por fatura (não tentar duas vezes o mesmo evento), limite de 1 tentativa forçada por método novo, e nenhuma cobrança forçada em assinaturas já canceladas.

## 3. Retorno do portal
Quando o cliente volta do portal de cobrança para o app, o portal do usuário faz uma verificação de status e mostra o resultado ("pagamento confirmado" ou "não conseguimos cobrar, tente outro cartão"), em vez de deixar a tela igual.

## 4. Avisos de WhatsApp que não saíram (Geová, 09 e 11/08)
Investigar por que o template HX68e8… falhou nesses dois envios (`whatsapp_sent = false`) e corrigir a causa — provavelmente contagem de variáveis ou fallback Meta→Twilio. Sem mudança de régua, só confiabilidade de entrega.

## PIX (Woovi/Asaas)
Não se aplica cobrança imediata: no PIX o cliente paga um QR novo, o que já é instantâneo. Mantemos a recuperação silenciosa de ~30 dias como está.

## Detalhes técnicos
- `supabase/functions/stripe-webhook/index.ts`: novos handlers de evento + helper `payOpenInvoicesNow(customerId, paymentMethodId)` usando `stripe.invoices.pay({ payment_method })`.
- Reaproveitar a lógica existente de sucesso de `invoice.paid` (ativação de acesso e mensagem) em vez de duplicar.
- Cancelar `scheduled_tasks` de dunning do usuário ao recuperar.
- `src/pages/Pagamento.tsx` / `UserPortal.tsx`: checagem de status ao retornar do portal.
- Nenhuma mudança de schema.
