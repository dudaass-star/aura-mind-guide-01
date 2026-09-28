# Modo visual de sessão na conversa

## O que será feito
- Detectar automaticamente quando existe uma sessão em andamento.
- Aplicar uma mudança visual suave na conversa apenas durante a sessão.
- Mostrar no topo “Sessão em andamento” e o tempo decorrido dentro dos 45 minutos.
- Exibir uma linha fina de progresso, sem contagem regressiva.
- Trocar o indicador do topo para “Momento de fechamento” nos minutos finais, sem inserir mensagem no chat.
- Restaurar o visual normal assim que a sessão terminar e manter o cartão de avaliação no encerramento.

## Detalhes técnicos
- Usar o estado real da sessão e atualizar o tempo localmente a cada minuto.
- Assinar mudanças da sessão para entrar e sair do modo visual sem recarregar a página.
- Usar somente cores e componentes do padrão visual existente.
- Validar em tela móvel e desktop, sem iniciar outra sessão de 45 minutos.
