# Correção definitiva do vazamento de nomes entre contextos

## Objetivo
Impedir que exemplos internos, respostas da própria Aura ou qualquer dado não confirmado pelo usuário sejam tratados como memória pessoal ou reapareçam em outra conversa.

## Ajustes

### 1. Remover exatamente os dados reais das orientações compartilhadas

Foram confirmados três pontos. As mudanças serão limitadas a eles e a eventuais ocorrências equivalentes encontradas na varredura final.

#### 1.1 Conversa principal da Aura
Hoje existe um exemplo global de resposta considerada boa:

> “Ah, que legal! Bella e Selena são nomes lindos ✨ | A Bella deve estar naquela fase das descobertas, falando tudo! | E a Selena ainda é bebezinha, né?”

Esse texto sai integralmente. Ele será substituído por um exemplo sem nome, idade ou característica pessoal:

> “Ah, que legal! Que fase gostosa de acompanhar ✨ | Deve ter muita descoberta acontecendo por aí, né?”

O objetivo de ensinar ritmo e divisão em mensagens continua igual; somente os dados pessoais e as suposições sobre crianças são removidos.

#### 1.2 Geração do retrato pessoal
Hoje há dois exemplos com dados do Eduardo:

> `Eduardo, pai da Bella e da Selena, em transição de hábitos e procurando mais liberdade no dia a dia.`

Será substituído por:

> `Pessoa dedicada à família, em transição de hábitos e buscando mais liberdade no dia a dia.`

E o exemplo estrutural:

> `"pessoas": [{"label":"Filhas","names":["Bella","Selena"],"nota":"(opcional)"}]`

Será substituído por um exemplo sem conteúdo pessoal reutilizável:

> `"pessoas": [{"label":"Relação confirmada","names":[],"nota":"descrição baseada somente nos dados fornecidos"}]`

O formato do retrato permanece; apenas os valores de cliente usados como demonstração deixam de existir.

#### 1.3 Acompanhamento automático
Hoje a orientação contém:

> `se o tema era "filha Bella", pergunte sobre a Bella`

Será substituída por:

> `faça referência somente ao tema e aos nomes presentes no contexto individual recebido; se nenhum nome estiver presente, não use nome`

#### 1.4 Varredura final
- Procurar outros nomes ou fatos reais usados como exemplos nas orientações compartilhadas das funções de conversa.
- Para cada ocorrência, remover o dado real e manter apenas a finalidade comportamental do exemplo.
- Não alterar regras de personalidade, metodologia, ritmo ou funcionamento que não contenham dados pessoais.

### 2. Impedir que a Aura grave a própria invenção como memória
- Para informações da categoria “pessoa”, aceitar nomes somente quando estiverem presentes em fala do usuário.
- Não considerar a resposta da Aura como fonte de confirmação factual.
- Se o usuário disser apenas “minhas filhas”, guardar a relação sem inventar nomes.
- Evitar que repetidas análises assíncronas aumentem a confiança de um dado que não veio do usuário.

### 3. Limpar o incidente da Ana
- Remover da memória de Ana somente o registro incorreto `filhas = Selena`.
- Preservar as correções registradas após o incidente, pois elas funcionam como proteção adicional.
- Confirmar que o resumo, retrato, sessões e demais memórias dela não receberam Bella ou Selena.

### 4. Testes e validação
- Criar testes com usuários sem nomes de familiares e mensagens como “vou cuidar das minhas filhas”.
- Confirmar que nenhum nome não informado aparece na resposta nem é salvo na memória.
- Testar duas conversas simultâneas com histórias e nomes diferentes para provar isolamento.
- Auditar as respostas históricas procurando nomes dos exemplos removidos fora das contas corretas.
- Invalidar o texto compartilhado antigo, publicar as funções afetadas e validar em produção pelos registros das novas chamadas.

## Resultado esperado
- Dados de clientes deixam de existir em orientações globais.
- Uma invenção do modelo não consegue virar memória persistente.
- O dado incorreto de Ana é removido sem apagar o restante da história dela.

## Detalhes técnicos
Funções afetadas: agente principal da Aura, análise pós-conversa, acompanhamento automático e geração de retrato. Não haverá barreira adicional antes do envio, alteração na identificação por telefone, tela nova ou aviso administrativo. A alteração de dados será restrita ao único registro contaminado confirmado.
