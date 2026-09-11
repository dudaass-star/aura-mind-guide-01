# Correção cirúrgica do uso indevido de nomes

## Objetivo
Eliminar a causa comprovada do incidente sem reformular amplamente as orientações da Aura nem retirar exemplos genéricos que ajudam o comportamento atual.

## Ajustes

### 1. Remover somente os exemplos contaminados por dados reais

Esses exemplos **não estão em sessões de usuários**. Estão em três orientações globais executadas para qualquer pessoa:

#### 1.1 Agente principal da Aura — texto global de comportamento
Local confirmado: bloco global da Aura, seção **“Ritmo natural de conversa (fora de sessão)”**, dentro do subtítulo **“Exemplo bom (3 balões equilibrados)”**.

Sai integralmente, sem substituição por outra frase:

> “Ah, que legal! Bella e Selena são nomes lindos ✨ | A Bella deve estar naquela fase das descobertas, falando tudo! | E a Selena ainda é bebezinha, né?”

A regra de quantidade e equilíbrio dos balões permanece. Este é o único exemplo removido desse bloco; os demais exemplos genéricos não serão alterados nesta correção.

#### 1.2 Geração do retrato pessoal
Local confirmado: orientação global da função que monta o retrato exibido no portal.

Saem integralmente:

> `Eduardo, pai da Bella e da Selena, em transição de hábitos e procurando mais liberdade no dia a dia.`

> `"pessoas": [{"label":"Filhas","names":["Bella","Selena"],"nota":"(opcional)"}]`

O exemplo da frase de apresentação será removido, mantendo a regra de estrutura e limite de tamanho. No esquema técnico, os dados reais serão trocados apenas por marcadores neutros de formato, sem criar uma história ou frase pronta alternativa.

#### 1.3 Acompanhamento automático
Local confirmado: orientação global que gera a mensagem enviada após uma conversa interrompida.

Sai integralmente:

> `se o tema era "filha Bella", pergunte sobre a Bella`

Nesse ponto específico, o nome real será retirado e ficará apenas a regra já pretendida: usar exclusivamente o tema e os nomes presentes no contexto individual recebido; sem nome confirmado, não usar nome.

#### 1.4 Limite explícito da alteração
- Não remover em massa exemplos genéricos de conversa, sessão, segurança, ritmo ou agendamento.
- Não reescrever a personalidade, metodologia ou condução da Aura.
- Fazer uma busca final apenas pelos nomes e fatos pessoais confirmados nesse incidente, removendo-os de orientações compartilhadas onde aparecerem.
- Não alterar arquivos de teste que não sejam usados nas conversas reais.

### 2. Limpar o incidente da Ana
- Remover da memória de Ana somente o registro incorreto `filhas = Selena`.
- Preservar as correções registradas após o incidente, pois elas funcionam como proteção adicional.
- Confirmar que o resumo, retrato, sessões e demais memórias dela não receberam Bella ou Selena.

### 3. Testes e validação
- Criar testes com usuários sem nomes de familiares e mensagens como “vou cuidar das minhas filhas”.
- Confirmar que Bella, Selena e Eduardo não aparecem na resposta nem no contexto de um usuário que não informou esses nomes.
- Testar duas conversas simultâneas com histórias e nomes diferentes para provar isolamento.
- Auditar as respostas históricas procurando somente os nomes envolvidos neste incidente fora das contas corretas.
- Invalidar o texto compartilhado antigo, publicar as funções afetadas e validar em produção pelos registros das novas chamadas.

## Resultado esperado
- Dados de clientes deixam de existir em orientações globais.
- O dado incorreto de Ana é removido sem apagar o restante da história dela.
- Os exemplos genéricos e o comportamento atual da Aura permanecem intactos.

## Detalhes técnicos
Funções afetadas: agente principal da Aura, acompanhamento automático e geração de retrato. Não haverá mudança ampla nos prompts, barreira adicional antes do envio, alteração no extrator de memória, identificação por telefone, tela nova ou aviso administrativo. A alteração de dados será restrita ao único registro contaminado confirmado.
