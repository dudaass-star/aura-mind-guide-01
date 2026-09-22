# Velocidade e capacidade do app Olá Aura

## Objetivo
Deixar o app perceptivelmente imediato no celular e verificar, com números, o comportamento sob 50, 100, 200 e 300 acessos simultâneos sem disparar conversas reais.

## O que será feito
- Medir abertura inicial, entrada em Conversas e troca entre Hoje, Sessões, Jornadas, Percurso, Meditações e Sobre você.
- Separar o carregamento do app das páginas públicas e administrativas, reduzindo o conteúdo baixado na primeira abertura.
- Manter áreas já visitadas prontas e antecipar silenciosamente as áreas mais prováveis, evitando novos carregamentos a cada toque.
- Reaproveitar dados comuns entre Hoje, Sessões, Percurso e Sobre você e reduzir consultas repetidas.
- Exibir cada tela imediatamente com estrutura estável, atualizando os dados sem travar a navegação.
- Revisar consultas mais pesadas e índices relacionados ao app.
- Simular 50, 100, 200 e 300 acessos simultâneos em leitura e navegação, sem envio de mensagens, áudio ou notificações.
- Testar separadamente a entrada de mensagens com uma função segura que não chama a AURA nem grava conversa de cliente.
- Validar novamente em celular pequeno e tela comum, incluindo abertura, troca rápida de áreas, voltar e reconexão.

## Critérios de sucesso
- O toque sempre muda a tela imediatamente, sem congelamento visível.
- A abertura inicial baixa apenas o necessário para o app solicitado.
- Áreas revisitadas reaparecem sem nova espera perceptível.
- O teste de 300 acessos mantém taxa de erro próxima de zero e tempos estáveis nas leituras.
- Nenhum cliente recebe mensagem, áudio, push ou WhatsApp durante os testes.

## Limite da validação
O teste controlado comprova navegação, consultas e entrada segura. A capacidade de 300 respostas simultâneas da AURA depende de um teste específico da fila de IA, que será medido sem envolver clientes e sem prometer capacidade antes dos resultados.
