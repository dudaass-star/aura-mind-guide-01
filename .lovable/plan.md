# Corrigir o silêncio após o limite do agente de recuperação

## Diagnóstico confirmado

A pergunta foi recebida normalmente em **10/09 às 19:27 BRT** no canal de recuperação:

> “Esse plano só terei direito a uma sessão por mês, se quiser outra vou pagar mais R$6,90 é isso?”

Ela não chegou ao agente de resposta. A conversa já tinha alcançado o teto de **8 respostas automáticas** e foi marcada como `limit_reached`; a regra atual encerra o atendimento silenciosamente. Não houve falha de entrega nem erro da IA.

Esse caso também revelou uma separação importante: o mesmo telefone já estava ativo na Aura, mas a pergunta foi feita no número de compra/recuperação. Por isso ela aparece como **Maria Bezerra** nesse histórico e como **Cibele Bezerra** no atendimento oficial.

## Correção

1. **O limite deixa de silenciar perguntas.** Ao atingir oito respostas, o agente continua atendendo dúvidas reais; o teto passa a impedir insistência comercial, não suporte solicitado pela pessoa.
2. **Cliente ativo entra sempre em modo suporte.** Perguntas sobre plano, sessões, cobrança, acesso e funcionamento recebem resposta direta, sem oferta, pressão comercial ou link de checkout.
3. **Preservar pausas legítimas.** Pedido explícito para parar e recusa continuam encerrando o atendimento. Horário silencioso e demais proteções permanecem como estão.
4. **Corrigir a conversa afetada.** Reabrir o atendimento dessa pessoa e responder a pergunta pendente com a regra correta do plano Essencial e do encontro avulso, depois de validar os benefícios vigentes na configuração do plano.
5. **Validar o fluxo completo.** Simular uma conversa acima de oito respostas, confirmar que uma nova dúvida recebe resposta e que nenhuma mensagem comercial adicional é disparada.

## Detalhes técnicos

- Ajustar o guard `limit_reached` em `recovery-agent`: para clientes ativos, nunca retornar em silêncio; para leads, distinguir pergunta recebida de iniciativa comercial.
- Limpar `needs_human/limit_reached` quando a própria pessoa envia uma dúvida atendível, sem alterar pausas `user_requested_human` e `lead_declined`.
- Consultar `plan_configs` antes da resposta real para não improvisar quantidade de sessões ou preço adicional.
- Republicar a função e verificar o registro da resposta e o status de entrega no WhatsApp.
