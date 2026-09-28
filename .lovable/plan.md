# Validar a naturalidade em uma sessão completa da Marina

## Objetivo
Eliminar o conflito que ainda força uma pergunta em cada resposta de exploração e verificar, numa sessão completa, se a AURA mantém profundidade com uma conversa mais humana.

## Implementação
- Ajustar as orientações existentes de exploração e tamanho de resposta; não criar nova fase.
- Manter perguntas quando necessárias, mas retirar fórmulas obrigatórias de “observação + pergunta”.
- Proteger a alternância entre pergunta, leitura, síntese, confronto e presença afirmativa com testes.

## Validação
- Executar os testes do agente e publicar a versão candidata.
- Conduzir uma sessão completa somente na conta demo Marina, do início ao encerramento.
- Comparar com a sessão anterior: sequência de perguntas, naturalidade, profundidade, correções aceitas, fechamento e resumo.
- Manter a versão apenas se preservar a qualidade e melhorar a naturalidade; caso contrário, restaurar a versão anterior.

## Limites
- Não usar clientes reais nem alterar cobrança.
- Não substituir o histórico anterior da Marina.
- A nova sessão ficará no histórico da conta demo como evidência da comparação.
