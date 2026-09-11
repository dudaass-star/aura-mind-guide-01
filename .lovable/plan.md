# Correção definitiva do vazamento de nomes entre contextos

## Objetivo
Impedir que exemplos internos, respostas da própria Aura ou qualquer dado não confirmado pelo usuário sejam tratados como memória pessoal ou reapareçam em outra conversa.

## Ajustes

### 1. Remover exemplos de falas prontas e dados reais das orientações compartilhadas

Esses exemplos **não estão em sessões de usuários**. Estão em três orientações globais executadas para qualquer pessoa:

#### 1.1 Agente principal da Aura — texto global de comportamento
Local confirmado: bloco global da Aura, seção **“Ritmo natural de conversa (fora de sessão)”**, dentro do subtítulo **“Exemplo bom (3 balões equilibrados)”**.

Sai integralmente, sem substituição por outra frase:

> “Ah, que legal! Bella e Selena são nomes lindos ✨ | A Bella deve estar naquela fase das descobertas, falando tudo! | E a Selena ainda é bebezinha, né?”

A regra será mantida apenas como princípio abstrato: variar naturalmente a quantidade de mensagens, manter cada mensagem completa e não fragmentar frases. Nenhuma fala pronta substituirá o exemplo.

Além desse trecho, o mesmo texto global contém diversas outras falas-modelo nas seções:
- reação proporcional e acolhimento;
- limites para assuntos profissionais;
- personalidade e calor humano;
- linguagem brasileira e conectivos;
- ritmo curto e direto;
- segurança e emergência;
- fases de presença, sentido e movimento;
- direção e fechamento;
- abertura, exploração e encerramento de sessões;
- memória de longo prazo.

Essas falas literais também serão removidas. Cada uma será convertida somente na intenção que precisa orientar a Aura, sem fornecer uma frase para copiar. Exemplos de mensagens do **usuário** podem permanecer apenas quando necessários para reconhecer uma intenção; exemplos de respostas da **Aura** sairão.

#### 1.2 Geração do retrato pessoal
Local confirmado: orientação global da função que monta o retrato exibido no portal.

Saem integralmente:

> `Eduardo, pai da Bella e da Selena, em transição de hábitos e procurando mais liberdade no dia a dia.`

> `"pessoas": [{"label":"Filhas","names":["Bella","Selena"],"nota":"(opcional)"}]`

Não haverá frase substituta. A primeira vira apenas uma regra de estrutura e limite de tamanho. No esquema técnico, os valores serão descritos pelos tipos esperados, sem nomes ou relações preenchidas.

#### 1.3 Acompanhamento automático
Local confirmado: orientação global que gera a mensagem enviada após uma conversa interrompida.

Sai integralmente:

> `se o tema era "filha Bella", pergunte sobre a Bella`

Fica apenas a regra: usar exclusivamente o tema e os nomes que estiverem no contexto individual recebido; sem nome confirmado, não usar nome.

#### 1.4 O que permanece
- Exemplos de entrada do usuário usados somente para reconhecer intenção, risco ou comando.
- Formatos técnicos obrigatórios, como tags de agendamento, pois não são frases para a Aura repetir livremente.
- Regras de método, personalidade, segurança, ritmo e funcionamento, reescritas sem respostas prontas.

#### 1.5 Varredura final
- Auditar todas as orientações compartilhadas das funções que conversam com usuários.
- Remover qualquer dado real de cliente e qualquer fala pronta atribuída à Aura.
- Preservar somente regras comportamentais, exemplos de entrada indispensáveis e contratos técnicos.

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
