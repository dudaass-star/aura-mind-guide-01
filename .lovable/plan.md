

## Sessoes mais humanas: profundidade com brevidade no WhatsApp

### O problema

O prompt atual desativa TODAS as regras de brevidade durante sessoes ativas (linha 282: "IGNORE as regras 4 e 5"). As instrucoes de sessao dizem "aprofunde com calma, sem pressa" sem nenhum limite de tamanho. Isso cria respostas longas demais pro WhatsApp.

### A solucao

Manter a profundidade e estrutura das sessoes, mas aplicar regras de comunicacao humana dentro delas. A AURA continua conduzindo com metodo, mas fala como amiga — nao como terapeuta dando palestra.

### Mudancas no prompt (arquivo `supabase/functions/aura-agent/index.ts`)

**1. Remover a "Protecao de Sessoes" que desativa brevidade (linha 282)**

Trocar:
- "Protecao de Sessoes: Durante sessoes ativas, IGNORE as regras 4 e 5"

Por:
- "Protecao de Sessoes: Durante sessoes ativas, as regras 4 e 5 sao flexibilizadas (voce pode ser mais densa), mas NUNCA abandone a brevidade. Sessao profunda NAO e sinonimo de texto longo."

**2. Adicionar regras de brevidade especificas para sessao (apos linha 648)**

Novas regras dentro do bloco de sessao:

- Cada resposta de sessao: MAXIMO 4-5 baloes curtos (usando "|||")
- Cada balao: maximo 2-3 frases
- Uma ideia por balao, uma pergunta por resposta (regra ja existente, reforcar)
- Profundidade vem da QUALIDADE da observacao, nao da QUANTIDADE de texto
- Proibido "mini-palestras": se precisa explicar algo complexo, quebre em turnos de conversa
- Preferir observacoes diretas e provocativas a paragrafos explicativos

**3. Atualizar as instrucoes de cada fase da sessao (linhas 617-643)**

Abertura:
- Saudacao calorosa + 1 pergunta. Nada mais. (2 baloes max)

Exploracao:
- 1 observacao perceptiva + 1 pergunta que abre. Por turno.
- NAO acumule 3 perguntas reflexivas numa resposta so
- Deixe o usuario processar antes de aprofundar mais

Reframe:
- 1 perspectiva nova por vez. Curta e impactante.
- "Voce percebeu que..." e mais forte que um paragrafo inteiro

Fechamento:
- Resumo em 3 baloes max: o que surgiu, o que leva, proximo passo
- NAO liste 5 insights — escolha os 2 mais fortes

**4. Adicionar exemplos de sessao boa vs ruim**

Exemplo RUIM (textao de sessao):
```
"Entao, pelo que voce ta me contando, parece que existe um padrao aqui
que se repete. Quando voce sente que nao esta sendo valorizada no
trabalho, voce tende a se retrair e aceitar mais tarefas pra provar
seu valor, o que acaba te sobrecarregando e criando um ciclo de
frustracao. Isso me lembra o que voce contou sobre sua relacao com
sua mae, onde voce tambem sentia que precisava fazer mais pra ser
vista. Sera que existe uma conexao entre essas duas situacoes?
Como voce se sente quando pensa nisso?"
```

Exemplo BOM (mesmo conteudo, formato WhatsApp):
```
"Voce percebeu que faz a mesma coisa no trabalho e com sua mae? |||
Nos dois lugares voce tenta provar seu valor fazendo MAIS... em vez
de exigir ser vista pelo que ja faz |||
O que voce acha que aconteceria se voce simplesmente parasse de
compensar?"
```

### Resultado esperado

- Sessoes continuam profundas e estruturadas (metodo das 4 fases mantido)
- Respostas ficam curtas e impactantes (estilo WhatsApp)
- Profundidade vem de observacoes certeiras, nao de textos longos
- Usuario processa melhor porque recebe uma ideia por vez

### Arquivo modificado

- `supabase/functions/aura-agent/index.ts` (apenas o prompt, secoes de sessao)

### Re-deploy

- Funcao `aura-agent`
