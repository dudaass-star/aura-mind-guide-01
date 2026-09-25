# Migração assistida da conversa para o App

## Objetivo
Tornar o App o único lugar para conversa livre e sessões com a AURA, mantendo o WhatsApp como entrada, notificações e atendimento operacional seguro.

## Implementação

1. **Barreira antes da AURA no WhatsApp**
   - Gravar a mensagem recebida no histórico, mas não acionar o agente para conversa livre ou início/continuação de sessão.
   - Identificar risco imediato antes da barreira e preservar o protocolo de segurança no próprio WhatsApp.
   - Preservar respostas operacionais determinísticas necessárias, como confirmação e avaliação de sessão.

2. **Transição assistida para clientes atuais**
   - Na primeira tentativa de conversar pelo WhatsApp, comunicar primeiro os ganhos reais: conversa mais fluida e privada, continuidade visível da história e sessões, jornadas e descobertas reunidas.
   - Somente depois dos ganhos, explicar de forma definitiva e acolhedora que conversas e sessões agora acontecem no app Olá Aura.
   - Gerar acesso individual de uso único e abrir diretamente a área correta: Conversar ou Sessões.
   - Nas repetições, responder de forma curta, com limite de frequência, sem chamar a AURA e sem gerar spam.
   - Atualizar o convite antigo, que apresentava o App como opcional.
   - Usar esta estrutura na mensagem principal: novidade concreta → benefícios verificáveis → mudança de canal → continuidade do WhatsApp operacional → acesso direto.

3. **Atendimento operacional Nível 1 no WhatsApp**
   - Responder orientações básicas sobre entrada, instalação, localização das áreas, notificações, pagamento, cancelamento e privacidade.
   - Reenviar acesso seguro quando necessário.
   - Manter respostas objetivas e impedir que o atendimento operacional vire continuação de conversa emocional.

4. **Encaminhamento Nível 2 por e-mail**
   - Direcionar para `suporte@olaaura.com.br` casos que exijam ação humana em cadastro, cobrança, assinatura, estorno, cancelamento não concluído ou direitos de privacidade.
   - Informar claramente que o caso precisa de supervisão humana e quais dados mínimos devem ser enviados.
   - Não encaminhar histórico emocional; somente contexto operacional necessário.

5. **Continuidade dentro do App**
   - Preservar o contexto da mensagem que motivou o redirecionamento para a pessoa não precisar recomeçar.
   - Abrir a conversa ou Sessões após o acesso, conforme a intenção detectada.
   - Receber o cliente com uma fala curta da AURA que reconhece a transição e convida a continuar, sem tutorial, campanha ou lista de recursos.
   - Registrar entrada, redirecionamento, abertura do App e primeira conversa para acompanhar onde clientes ficam travados.

## Regras de segurança e experiência
- Nenhum bloqueio seco: toda primeira tentativa recebe explicação e acesso direto.
- Não vender “um novo canal”; vender continuidade, organização e presença. Toda promessa deve corresponder ao que o App já entrega.
- A AURA não promete alterações financeiras ou cadastrais que não realizou.
- WhatsApp continua disponível para risco imediato e ajuda operacional.
- Conteúdos e botões deixam de entregar experiências completas no WhatsApp e passam a abrir a área correspondente no App.
- Toda comunicação e documentação permanecem em PT-BR e no fuso BRT.

## Validação
- Testar conversa livre, tentativa de sessão, acesso com falha, dúvida Nível 1, caso Nível 2, repetição do redirecionamento, confirmação/avaliação de sessão e mensagem de risco.
- Confirmar que conversa livre nunca chega ao agente pelo WhatsApp e continua funcionando normalmente no App.
- Verificar histórico, links de uso único, destinos corretos e ausência de respostas duplicadas.
