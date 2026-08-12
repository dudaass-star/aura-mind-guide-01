# Avisos de 09 e 11/08 do Geová: não foi falha de entrega

Fui no banco antes de mexer em qualquer coisa. Os dois registros com `whatsapp_sent = false` nessas datas têm `error_stage = 'limit_reached'` e a mensagem "Já enviados 4 WhatsApps neste ciclo (limite 4)". Ou seja: o WhatsApp não saiu **porque a régua tem teto de 4 mensagens por ciclo de cobrança** (2 avisos + 30% off + Lite), e ele já tinha recebido as 4 (01, 03, 05 e 07/08). O template HX68e8… está íntegro e é o mesmo que o `system_config` aponta hoje.

E o cliente não ficou no escuro nesses dois dias: o e-mail `dunning-payment-failed` foi enviado e registrado como `sent` em 09/08 15:01 e 11/08 19:01, junto com todas as outras 4 tentativas.

Detalhe histórico que explica a estranheza dos SIDs: nos avisos 1 e 2 (01 e 03/08) saíram os templates de oferta (30% e Lite), porque a régua "2 avisos primeiro" só entrou depois, em 04/08. Do dia 05 em diante a ordem está correta. Nada a fazer aí.

## O que realmente está errado (1 item, pequeno)

A auditoria mente sobre canal. No caminho de e-mail do `stripe-webhook`, o sucesso do envio grava `whatsapp_sent = true` no registro de `dunning_attempts` (o comentário no código diz "reusing field as notification_sent"), e esse registro fica com `channel` nulo. Resultado: quem olha a tabela ou o painel não distingue "e-mail entregue" de "WhatsApp entregue", e é exatamente por isso que os dias 09 e 11 pareciam falha de envio.

Correção proposta:
- gravar `channel = 'email'` nesses registros e usar um campo próprio de resultado em vez de reaproveitar `whatsapp_sent`;
- manter a contagem do teto de 4 restrita a `channel = 'whatsapp'` (já é, mas fica explícito) para o ajuste não mexer na régua.

## O que eu sugiro NÃO mudar

- O teto de 4 avisos por ciclo no WhatsApp: é proteção de reputação do número e foi decisão sua.
- A régua de retries do Stripe (~3 semanas) e o acesso mantido durante ela.

## Opcional (só se você quiser)

Um último aviso no WhatsApp quando o Stripe esgota os retries e a assinatura vai virar `canceled`/`unpaid` — hoje esse momento final só tem e-mail. Seria 1 mensagem extra por ciclo, fora do teto atual.

## Detalhes técnicos

- `supabase/functions/stripe-webhook/index.ts`: no bloco `invoice.payment_failed`, separar o registro de e-mail (`channel: 'email'`) do registro de WhatsApp; parar de setar `whatsapp_sent = true` no sucesso do e-mail.
- `supabase/functions/_shared/dunning-whatsapp.ts`: nenhuma mudança de cadência; só confirmar o filtro por `channel = 'whatsapp'` na contagem.
- Sem migração de schema (as colunas `channel` e `provider` já existem em `dunning_attempts`).
