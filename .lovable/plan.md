# Aura como companhia, não caçadora de problemas

## O que a verificação mostrou (código + conversas reais)

**No código (`supabase/functions/aura-agent/index.ts`, 8.5k linhas):**

1. A abertura leve já existe e funciona — mas o exemplo dentro do próprio bloco já empurra pra problema: `"tô por aqui, o que te traz hoje?"` (linha 6616). O gate também é estreito: só dispara com saudação pura ou mensagem de até 8 palavras sem palavra emocional.
2. Não existe **downshift de modo**. A classificação (PING-PONG / PROFUNDO / DIREÇÃO) é feita por mensagem, mas nada diz o que fazer quando o usuário está num tema pesado e traz assunto leve. Os guardrails de profundidade (`VALIDA + ENTREGA`, `GUARDRAIL SIMÉTRICO` de entrega a cada 4 trocas, `REGRA DE VALOR`) seguem valendo e puxam a conversa de volta.
3. O bloco de mudança de tema (linha 1298) instrui literalmente: `Pergunte sobre a SITUAÇÃO concreta: "O que tá acontecendo?"` — ou seja, tema novo e leve entra tratado como caso a investigar.
4. A postura mestre diz `Você não é assistente do humor do usuário. Você é a presença clínica dele.` (linha 2823). Não existe nenhuma seção que autorize **companhia**: comemorar, rir, curiosidade sobre o dia comum, conversa sem entregável.
5. `MODO PING-PONG` existe, mas é descrito como troca "factual/neutra" curta (máx. 300 caracteres) — é ausência de profundidade, não presença afetiva. Não há repertório de companhia.

**Nas conversas reais (últimos 14 dias):**

- Saudação pura já é respondida certo (`"Bom dia! ✨"`, `"Oi, Sandra! Que bom te ver por aqui."`) — o ajuste anterior pegou isso.
- O problema aparece no **turno 2 em diante**. Caso real de 16/08: a usuária pergunta `"pilates faz mais efeito que musculação?"` e a Aura responde `"o que eu tô vendo aqui é que você tá se esforçando pra caramba..."`; antes disso, sobre dor abdominal do treino: `"me diz: você acha que esse esforço todo no treino hoje foi um jeito de tentar 'compensar' o comentário dele?"`. Assunto leve virou material clínico duas vezes seguidas.
- Cerca de 10 a 20 mensagens da Aura por dia contêm formulações do tipo "o que tá pesando / o que tá acontecendo / o que te traz".

Conclusão: não é a saudação. É a **incapacidade de descer de marcha** e a ausência de um modo de companhia legítimo.

## O que fazer

### 1. Criar o MODO COMPANHIA (novo, fora de sessão)
Um quarto modo, no mesmo nível dos outros, para: dia comum, boa notícia, curiosidade, opinião boba, humor, desabafo trivial, tédio, "só queria falar com alguém".
- Regra central: **companhia não precisa de entregável**. Nada de hipótese, leitura, confronto ou passo.
- Repertório explícito: comemorar de verdade, reagir com curiosidade concreta ao conteúdo (não ao subtexto), opinar, brincar, contar de volta, ficar em silêncio confortável.
- Proibições no modo: nomear emoção que o usuário não nomeou, transformar fato leve em padrão, buscar subtexto emocional, terminar com pergunta investigativa.
- Ajuste na `REGRA DE CLASSIFICAÇÃO`: sem carga emocional → COMPANHIA ou PING-PONG (companhia quando há conteúdo de vida; ping-pong quando é só troca factual).

### 2. Regra de downshift (o furo confirmado no caso do pilates)
Nova regra na estrutura de atendimento: quando o usuário traz assunto leve **depois** de um tema pesado, a Aura acompanha o assunto leve pelo que ele é. Fica proibido reconectar ao tema pesado no mesmo turno, salvo se o próprio usuário reabrir. Um tema pesado aberto não autoriza reinterpretar tudo que vem depois.

### 3. Reescrever a instrução de mudança de tema
Trocar `"O que tá acontecendo?"` por reação ao conteúdo com curiosidade concreta. Só migra pra mapeamento de situação se houver sinal emocional real na fala.

### 4. Reescrever os exemplos de abertura
`"o que te traz hoje?"` sai. Entram devolutivas de companhia (`"e aí, como foi o dia?"`, `"tô por aqui, me conta as novidades"`), com variação obrigatória pra não virar novo bordão.

### 5. Ampliar o gate de abertura leve
Hoje: saudação pura ou até 8 palavras. Passa a cobrir mensagem de conteúdo cotidiano sem carga emocional independentemente do tamanho (trabalho, treino, filho, série, comida, viagem), com a mesma proibição de puxar memória/insight/compromisso.

### 6. Suspender os guardrails de entrega em companhia
Deixar explícito que `VALIDA + ENTREGA`, `GUARDRAIL SIMÉTRICO`, `REGRA DE VALOR` e `CARDÁPIO DE FECHAMENTO` não valem em COMPANHIA — hoje a exceção só menciona PING-PONG.

### 7. Ajustar a postura mestre
A frase `"Você não é assistente do humor do usuário"` fica, mas ganha contrapeso: presença clínica **inclui** ser companhia; ir contra a corrente é intervenção pontual quando o discernimento pede, não postura permanente.

### 8. Medir se melhorou
KPI no admin, ao lado de "correções por 100": **taxa de conversão indevida em tema pesado** — proporção de respostas da Aura, fora de sessão e em turno leve, que contêm marcadores de leitura clínica (`o que tô vendo`, `o que tá pesando`, `isso mostra que`, `faz sentido ou tô errando`). Baseline medido antes do ajuste, comparação depois.

## Detalhes técnicos

- Alterações no prompt estático e nos blocos dinâmicos de `supabase/functions/aura-agent/index.ts`: seção `# ESTRUTURA DE ATENDIMENTO` (~3075-3200), bloco `ABERTURA LEVE DETECTADA` (~6612), `topicShiftGuidance` (~1298), `# POSTURA CLÍNICA` (~2821).
- Detector de "conteúdo cotidiano sem carga emocional" em TypeScript no backend (léxico + ausência de `EMOTIONAL_LOAD_REGEX`), seguindo o padrão determinístico já usado — sem depender do LLM classificar certo.
- KPI: consulta SQL sobre `messages` (role assistant, fora de sessão) exposta no painel de engajamento existente.
- Nada muda dentro de sessão agendada: sessão continua com método próprio (Abertura → Exploração → Reframe → Encerramento).