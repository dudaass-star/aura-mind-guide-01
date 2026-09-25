# Fechar confiabilidade da conversa

## Objetivo
Eliminar os riscos residuais no envio de mensagens seguidas e comprovar que falhas transitórias são recuperadas sem ação do cliente.

## Implementação
- Identificar a origem comprovável dos erros recentes do agente e preservar detalhes úteis nos registros.
- Corrigir a espera indevida quando uma mensagem já aceita é reenviada.
- Tornar a coordenação de mensagens consecutivas determinística, sem perder a fala mais recente.
- Adicionar um modo de teste interno e seguro para simular uma única falha transitória, sem exposição na interface.
- Cobrir concorrência, duplicação e retomada automática com testes.

## Validação
- Executar os testes das funções envolvidas.
- Publicar somente as funções alteradas.
- Simular mensagens consecutivas e uma falha transitória controlada na conta de demonstração.
- Confirmar resposta persistida, ausência de botão de retomada e ausência de novas falhas.
