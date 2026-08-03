# Caso Eduardo: por que um cliente novo caiu num "número antigo"

## Fatos confirmados no banco

- Eduardo (5512974013440) é cliente novo: perfil criado 03/08 15:14 UTC, plano Essencial, `active` até 03/09.
- Ele **nunca** foi vinculado à instância Z-API antiga: `profiles.whatsapp_instance_id` é nulo. A hipótese do "número antigo da Z-API" está descartada.
- Às 16:03 ele escreveu "Oi" e a AURA respondeu a boas-vindas completa às 16:04. Está funcionando agora.
- Nenhum texto nosso (templates, e-mail, mensagem de boas-vindas) menciona troca de número — o aviso "mudou de número" é o banner nativo do WhatsApp.

## Causa provável (ainda não confirmada)

O projeto usa **dois remetentes Twilio distintos**:

- `TWILIO_WHATSAPP_FROM` — número da AURA (agente e templates).
- `TWILIO_RECOVERY_FROM` — número de recuperação/suporte, usado pelo Recovery Inbox (as mensagens "ADMIN" do print).

O banner "este número mudou / toque para o novo número" aparece quando o WhatsApp entende que a conta de um número foi migrada para outro. Com dois remetentes na mesma conta Twilio/WABA, é plausível que o chat que ele recebeu tenha exibido esse banner apontando para o outro número — e o número apontado não processa mensagem de agente, então ele ficou ~3h sem resposta. Isso precisa ser confirmado antes de mexer em qualquer coisa.

## Passo 1 — diagnóstico

1. Ler os valores de `TWILIO_WHATSAPP_FROM` e `TWILIO_RECOVERY_FROM` e comparar com o número divulgado (`wa.me/16625255005` no e-mail, portal e página de cancelamento).
2. Nos logs das edge functions de envio e de recuperação, verificar de qual `From` saíram as mensagens para 5512974013440 em 02–03/08.
3. Confirmar no Twilio se algum desses números passou por migração/troca de WhatsApp Sender recentemente, o que explicaria o banner.

## Passo 2 — correções conforme o resultado

- **Se o número divulgado ≠ remetente real da AURA:** alinhar o número público (e-mail de boas-vindas, portal, página de cancelamento, links `wa.me`) ao remetente real.
- **Se o banner vem da coexistência dos dois remetentes:** garantir que mensagens recebidas no número de recuperação também cheguem ao agente, ou deixar explícito na mensagem de suporte qual chat responde pela AURA.
- **Em qualquer cenário:** registrar log de inbound recebido em número não mapeado, para detectarmos esse silêncio em minutos, não em horas.

## Detalhes técnicos

- Remetentes: `supabase/functions/_shared/whatsapp-official.ts` (`getFromNumber`) e `_shared/twilio-recovery-client.ts`.
- Número público hardcoded em `_shared/transactional-email-templates/welcome.tsx`, `src/components/portal/whatsapp.ts`, `src/pages/CancelSubscription.tsx`, `src/components/portal/PhoneLinkPrompt.tsx`.
- Nada a mudar no fluxo PIX/assinatura: ciclo pago até 03/09 e reautorização já coberta pelo fluxo D-2.
