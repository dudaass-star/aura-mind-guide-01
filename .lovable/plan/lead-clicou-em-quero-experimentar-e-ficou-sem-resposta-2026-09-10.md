# Lead clicou em "Quero experimentar" e ficou sem resposta

## O que aconteceu com a Lu (+55 21 97278-6432)

Em 04/09 ela perguntou "Estende a dependente menor?". O agente não tinha essa resposta na base e mandou ela pro e-mail do suporte. Nesse momento a conversa foi marcada como "assunto entregue ao humano" — e essa marcação nunca cai.

Seis dias depois, em 10/09 às 14:50, ela clicou em "Quero experimentar". O agente leu a marcação antiga, entendeu "essa conversa não é mais minha" e não respondeu nada. Ela ficou esperando.

Dois defeitos somados:

1. A pausa criada por nós mesmos (pergunta fora da base) é tratada como se fosse a pessoa pedindo pra não falar mais com o agente. É permanente.
2. Existe uma regra que deveria zerar a pausa quando a pessoa reaparece depois de 48h, mas ela nunca funciona: o horário do último contato é gravado antes do agente ser chamado, então da perspectiva dele a pessoa "acabou de falar" e nunca "reapareceu".

## O que vai mudar

1. **Pausa por pergunta fora da base deixa de ser permanente.** Continua valendo pro assunto do momento, mas expira: se a pessoa voltar a escrever depois de algumas horas, o agente atende normalmente. Pausa continua definitiva só quando a própria pessoa pede pra parar ou recusa.
2. **Consertar a regra de reabertura de conversa.** Passar a comparar com o contato anterior de verdade, não com a mensagem que acabou de chegar.
3. **Quem pede pra experimentar sempre é atendido.** "Quero experimentar", "quero a sessão avulsa" e afins passam a furar qualquer pausa nossa (fora da base, cota de respostas atingida) e recebem na hora o encontro guiado de 45 min por R$ 6,90. Pedido de parar/recusa continua sendo respeitado.
4. **Responder a Lu agora**, com o link do encontro guiado, já que ela está esperando desde ontem à tarde.

## Detalhes técnicos

- `recovery-agent/index.ts`:
  - `HARD_PAUSES` fica só com `user_requested_human` e `lead_declined`; `escalated_email` passa a ser pausa com validade (expira ~6h após `last_bot_reply_at`).
  - Reabertura: usar o penúltimo inbound de `recovery_messages` (ou `last_bot_reply_at`) em vez de `recovery_conversations.last_inbound_at`, que o `webhook-twilio-recovery` já sobrescreveu antes do invoke.
  - Fast-path de taster: se `RE_SINGLE_SESSION_REQUEST` (pix-buttons.ts) casar com a mensagem atual ou com algum inbound não respondido, ignorar pausas nossas e `limit_reached` e seguir para o fluxo de oferta.
- Republicar `recovery-agent` e disparar a resposta real para `5521972786432`.
- Sem mudanças de schema. Trilhos de recuperação, quiet hours e travas de cliente/pagante permanecem intactos.
