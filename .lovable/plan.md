

# Avaliação de Qualidade Terapêutica das Sessões da Aura

## O que já está forte

- Estrutura de 6 fases com controle temporal server-side (não depende da IA)
- Hard blocks que impedem encerramento prematuro
- Método Socrático + Logoterapia no prompt
- Continuidade entre sessões (compromissos, temas, insights)
- Extração automática de insights e compromissos no encerramento
- Instruções claras de "observar > perguntar" e "provocar com gentileza"

## Pontos de preocupação (o que pode comprometer a qualidade)

### 1. Reframe depende 100% do improviso da IA
O prompt da fase de reframe (linhas 1662-1672) é vago: "Ofereça NOVAS PERSPECTIVAS baseadas no que o usuário revelou". Não há técnicas estruturadas. Em terapia real, o reframe usa ferramentas específicas:
- **Externalização** ("Se essa ansiedade fosse uma pessoa, o que ela diria?")
- **Escala temporal** ("Daqui a 5 anos, como você vê isso?")
- **Inversão de papéis** ("Se sua melhor amiga estivesse vivendo isso, o que você diria pra ela?")
- **Busca de sentido (Logoterapia)** ("Por quem você está enfrentando isso?")

**Sugestão**: Enriquecer o prompt de reframe com 4-5 técnicas concretas que a IA pode escolher conforme o contexto, sem engessar — oferecendo um "cardápio" de ferramentas.

### 2. Exploração pode ficar circular
A fase de exploração diz "vá mais fundo", mas não dá direcionamento de profundidade. Um terapeuta real usa camadas:
- Camada 1: O que aconteceu (fato)
- Camada 2: O que sentiu (emoção)
- Camada 3: O que isso significa pra você (crença)
- Camada 4: De onde vem essa crença (origem)

**Sugestão**: Adicionar esse modelo de "camadas de profundidade" no prompt de exploração como guia (não regra rígida), para que a IA saiba quando está na superfície e quando já chegou fundo.

### 3. Fechamento pode ficar superficial
O roteiro de encerramento pede "resumo + compromisso + escala 0-10". Mas falta o elemento mais transformador: a **pergunta de integração** — "O que mudou em você entre o começo e o final dessa sessão?". Esse é o momento em que o usuário conscientiza a transformação.

**Sugestão**: Adicionar uma "pergunta de integração" ao protocolo de soft_closing/final_closing.

### 4. Sem validação da qualidade da exploração antes de avançar
A transição entre fases é puramente temporal (25 min → reframe). Em terapia real, você só faz reframe quando explorou o suficiente. Se a conversa está superficial aos 25 min, o reframe vai ser fraco.

**Sugestão**: Adicionar no prompt de transição exploration→reframe uma checagem: "Se ainda está na superfície (usuário dando respostas curtas, sem nomear emoções), CONTINUE explorando em vez de avançar para reframe. O tempo é guia, não regra."

### 5. Falta "meta-comunicação terapêutica"
Terapeutas bons nomeiam o processo: "Percebi que quando eu perguntei X, você mudou de assunto. O que aconteceu ali?". O prompt menciona isso vagamente na seção de padrões, mas não no contexto de sessão.

**Sugestão**: Adicionar 2-3 exemplos de meta-comunicação no prompt de exploração.

## Resumo das mudanças propostas

| Local no prompt | Mudança | Risco |
|---|---|---|
| Fase de Reframe (linhas 1662-1672) | Adicionar cardápio de 5 técnicas de reframe | Baixo — enriquece sem engessar |
| Fase de Exploração (linhas 1632-1661) | Adicionar modelo de "camadas de profundidade" | Baixo — é guia, não regra |
| Fase de Soft Closing (linhas 1681-1688) | Adicionar pergunta de integração | Mínimo |
| Transição Exploration→Reframe | Flexibilizar avanço se exploração está rasa | Baixo |
| Exploração | Exemplos de meta-comunicação terapêutica | Mínimo |

**Filosofia**: Nenhuma dessas mudanças engessa. São ferramentas que a IA pode usar quando fizer sentido, não regras obrigatórias com keywords. É como dar mais instrumentos pra um músico — ele escolhe qual tocar.

