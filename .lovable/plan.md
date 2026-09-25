# Primeira experiência do cliente novo no App

## Objetivo
Fazer o cliente novo sentir que a AURA já o recebeu, conduzi-lo naturalmente à primeira conversa e apresentar a primeira sessão dentro do App, sem depender do WhatsApp.

## O que será alterado
- Distinguir cliente novo de cliente migrado na primeira entrada.
- Para cliente novo, abrir diretamente a conversa e mostrar uma saudação personalizada da AURA com o primeiro nome.
- Trocar a mensagem genérica de migração por uma abertura curta, acolhedora e com uma pergunta simples que facilite a primeira resposta.
- Manter a mensagem “Sua história continua aqui” somente para clientes migrados do WhatsApp.
- Armar o convite à primeira sessão após a primeira troca real no App, sem depender do botão ou da recepção do WhatsApp.
- Preservar o fluxo atual para clientes que já têm histórico, evitando repetir boas-vindas.

## Comportamento esperado
1. Pagamento confirmado e entrada automática no App.
2. Cliente novo chega diretamente à conversa com a AURA.
3. AURA o recebe pelo nome e faz uma pergunta curta para iniciar.
4. Cliente responde por texto ou áudio e recebe a condução normal.
5. Após a primeira troca real, a AURA oferece a primeira sessão de 45 minutos de forma natural.
6. Instalação e notificações continuam sendo apresentadas depois que já houve valor percebido.

## Garantias e validação
- Simular compra nova, entrada automática, entrada alternativa por e-mail e retorno em outro aparelho.
- Simular cliente novo, cliente migrado e cliente antigo com histórico.
- Confirmar que a saudação não duplica ao atualizar ou reabrir o App.
- Confirmar que o convite à sessão acontece no App e não cria sessão sem aceite.
- Validar texto, áudio, recusa, aceite e reagendamento da primeira sessão.
- Verificar a experiência em celular e computador.

## Detalhes técnicos
- Usar um marcador persistente e idempotente para a recepção inicial, em vez de depender apenas do armazenamento do aparelho.
- Registrar a saudação como mensagem real da AURA para manter continuidade entre aparelhos.
- Separar explicitamente os estados de aquisição nova e migração do WhatsApp.
- Reaproveitar o mecanismo determinístico existente de convite e aceite da sessão D0, alterando apenas o ponto de ativação para o App.
