# Agendamento de sessões dentro do app

## Objetivo
Permitir que o cliente agende, reagende e cancele uma sessão na própria área **Sessões**, sem precisar conversar com a AURA ou abrir o WhatsApp.

## Experiência do cliente
- Trocar “Agendar pelo WhatsApp” por **Agendar sessão**.
- Abrir uma janela simples para escolher data e horário em intervalos de 15 minutos, sempre no horário de Brasília.
- Não exigir antecedência mínima; o primeiro horário disponível será o próximo intervalo válido.
- Mostrar uma confirmação clara antes de concluir.
- Quando existir uma sessão futura, oferecer **Reagendar** e **Cancelar** diretamente no app.
- Permitir reagendar ou cancelar até o horário marcado.
- Atualizar imediatamente a sessão exibida e o contador do mês.
- Indicar quando o limite mensal já foi atingido, sem levar o cliente ao WhatsApp.

## Regras e segurança
- Validar no servidor a identidade do cliente, o acesso ativo e a quantidade de sessões do plano.
- Considerar sessões concluídas, em andamento e futuras no consumo do mês; cancelamentos não consomem a cota.
- Impedir dois agendamentos futuros simultâneos e proteger contra toque duplo.
- Fazer agendamento, reagendamento e cancelamento de forma indivisível, evitando estados incompletos.
- Reiniciar os avisos ao reagendar e invalidar avisos antigos pelo identificador da sessão.
- Manter o fuso de Brasília em toda a escolha, gravação e apresentação dos horários.

## Lembretes e início
- Reaproveitar o fluxo atual de notificações para avisar 24 horas e 5 minutos antes.
- Se a sessão for marcada dentro de uma dessas janelas, enviar somente os próximos avisos aplicáveis, nunca um lembrete atrasado.
- Direcionar o toque do lembrete de 5 minutos para a conversa, pronta para começar a sessão.
- Manter o WhatsApp apenas como alternativa quando o push não estiver disponível, respeitando horário silencioso.

## Validação
- Testar agendamento, toque duplo, reagendamento, cancelamento e limite esgotado.
- Testar horários no mesmo dia, virada do mês e conversão correta para BRT.
- Testar sessão marcada a menos de 5 minutos, entre 5 minutos e 24 horas e acima de 24 horas.
- Validar em tela de celular que a escolha de horário, os avisos e as confirmações não estouram a largura.
