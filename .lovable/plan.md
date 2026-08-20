# Sessão da Lidiane (20/08, nota 4): o que aconteceu e o que ajustar

Primeira sessão dela (plano Essencial), tema "dependência emocional no relacionamento".
Início 12:37 BRT, fechamento 13:20, 2 áudios, sem compromisso registrado, fechamento no
formato "pergunta-pra-carregar". Nota 4, sem comentário.

## O que funcionou

- Exploração real: fato (briga de sexta, silêncio de 4 dias), emoção (nó na garganta,
  aperto no peito) e crença ("o silêncio dele diz que eu não significo nada") ficaram
  cobertos com falas dela.
- Reframe forte e legítimo: "você prefere o sufocamento da presença ao medo da falta".
  Ela validou duas vezes ("faz sentido").
- Ela pediu direta, e a Aura foi direta — sem dramatizar.

## Os 4 problemas concretos (prováveis responsáveis pelo 4 em vez de 5)

1. **Setup de agenda invadiu o momento clínico.** Às 12:45 ela acabou de dizer "sim, e a
   angústia" e a Aura respondeu com três mensagens seguidas pedindo dia e hora da sessão
   mensal ("mas antes, pra gente fechar sua agenda..."). O foco tinha acabado de ser
   escolhido e foi interrompido por burocracia. Isso queima o pico de abertura.
2. **Loop da mesma tese.** A dupla vazio/sufocamento foi repetida em cinco blocos
   diferentes e "faz sentido ou tô errando o ângulo?" apareceu quatro vezes. A partir da
   terceira, deixa de ser hipótese e vira insistência.
3. **Correção dela foi ignorada.** Ela corrigiu explicitamente: "não tenho medo de ficar
   sozinha, tenho medo de ficar sem ele". A Aura reconheceu em uma linha e reimpôs a mesma
   leitura de vazio/solidão. É exatamente o padrão de interpretação imposta que gera as
   correções de memória.
4. **A camada de origem nunca foi trabalhada.** "De onde vem essa ideia de que o outro
   define o seu tamanho?" foi perguntada uma vez, ela respondeu "não sei" e a Aura passou a
   repetir a tese em vez de ir pra história (relações anteriores, família, quando isso
   começou). Ela saiu do "eu não queria sentir isso" sem nenhum apoio prático, só com uma
   pergunta pra carregar.

## Por que o loop da mesma tese aconteceu (causa confirmada no código)

Três coisas se somaram, todas no `aura-agent`:

1. **A frase é um molde fixo repetido em 5 lugares do prompt.** "O que tô vendo daqui é
   [X]. Faz sentido pra você ou tô errando o ângulo?" está escrita literalmente no cardápio
   de reframe, na regra "entrega como hipótese", no detector de pedido de direção e na
   orientação de fase. Sempre que qualquer um desses blocos entra no contexto, o modelo
   recebe a frase pronta e a copia — por isso ela sai idêntica quatro vezes.
2. **Nada registra que a hipótese já foi entregue e aceita.** O avaliador de fase
   reinjeta a orientação "entregue como hipótese aberta" a cada turno em que a conversa
   segue em `sentido` com 5+ trocas. Não existe estado do tipo "tese central já oferecida"
   nem "usuário já validou", então cada turno é tratado como se fosse a primeira entrega.
3. **A regra anti-loop olha só o tamanho da resposta do usuário, não a repetição da
   Aura.** Ela classifica respostas curtas: quando são evasivas, manda "ofereça sua
   leitura, não mais uma pergunta". A Lidiane respondeu curto e "não sei" várias vezes,
   então esse caminho disparou repetidamente — e a única leitura disponível na mesa era a
   mesma (vazio × sufocamento). Resultado: a mesma tese devolvida em blocos sucessivos.
4. **O phase evaluator interno do `aura-agent` reinjeta a orientação a cada turno.** Não é um
   micro-agente separado: é a função `evaluateTherapeuticPhase()` dentro do
   `supabase/functions/aura-agent/index.ts` que, ao detectar `sentido` com 5+ trocas,
   adiciona ao `dynamicContext` a instrução de "entregue como hipótese aberta". Como não
   existe guarda de "já entregue", ela repete a mesma orientação (e o molde) a cada
   mensagem seguinte.

O agravante do item 3 da lista acima (correção ignorada) tem a mesma raiz: como não há
estado da hipótese, a recusa dela não invalidou nada — o turno seguinte recebeu de novo a
instrução de entregar a leitura e o modelo reciclou a que já tinha.


## Ajustes propostos (prompt, sem nova complexidade)

1. **Agenda fora da fase clínica.** O bloco de setup mensal só entra na abertura (antes do
   primeiro tema) ou no fechamento — nunca depois que o foco da sessão já foi definido.
2. **Tirar os moldes de frase do prompt.** Você tem razão: o prompt hoje entrega a frase
   pronta ("O que tô vendo daqui é [X]. Faz sentido pra você ou tô errando o ângulo?") em
   cinco lugares, e o modelo copia. Trocar todos por instrução de intenção — "arrisque sua
   leitura e deixe explícito que é uma hipótese que ela pode recusar ou corrigir, com
   palavras suas, variando a formulação" — sem nenhum texto literal para copiar. O mesmo
   vale para os outros exemplos de fala engessados que aparecerem nesses blocos: viram
   descrição do efeito desejado, não script.
3. **Anti-loop de reframe.** Uma hipótese central por sessão, oferecida no máximo duas
   vezes. Se a pessoa já validou, seguir adiante em vez de reoferecer.
4. **Guarda no phase evaluator (resolvendo a tensão com o item 2).** A crítica está certa:
   sem a frase fixa não há como detectar repetição com `.includes()`. Escolha adotada é a
   saída (b), com um detalhe: em vez de julgamento semântico caro, dois campos booleanos
   novos no JSON que o micro-agent extractor **já** devolve a cada turno
   (`aura_hypothesis_delivered`, `user_validated_hypothesis`). Zero chamada extra de LLM;
   o custo é 1 linha de schema e 2 flags no `lastUserContext`. O plano passa a admitir
   explicitamente esse estado novo mínimo — a alternativa (a) foi descartada porque manter
   um molde literal no prompt reintroduz exatamente o problema que gerou o loop.
   Com as flags: se `aura_hypothesis_delivered` e não houve recusa, `evaluateTherapeuticPhase()`
   deixa de reinjetar "entregue como hipótese" e passa a orientar o próximo movimento
   (origem/história ou fechamento).
5. **Correção do usuário vence a hipótese.** Quando a pessoa corrige a leitura, a Aura
   incorpora a palavra dela e reformula a partir dali, sem devolver a versão anterior.
6. **"Não sei" duas vezes = trocar de camada.** Em vez de reafirmar a tese, ir pra origem
   e história concreta (quando começou, com quem mais isso já aconteceu).
7. **Fechamento com apoio quando há ativação aguda.** Se a última fala do usuário indicar
   dor viva ("eu não queria sentir isso"), o fechamento inclui algo pra atravessar a noite,
   não só a pergunta pra carregar.
8. **Blindar o bloco de agenda com `sessionActive` (novo, vindo da crítica).** O gatilho na
   linha 6557 realmente não checa sessão ativa nem fase, e o texto é redigido como mandato
   ("SEU OBJETIVO: 1. Perguntar..."). Passa a ter a mesma blindagem `if (sessionActive)` que
   os outros blocos sensíveis já têm, liberado só na abertura/fechamento.
9. **Emissão confiável de `[ENCERRAR_SESSAO]` (novo).** Confirmado nos dados: o `ended_at`
   da sessão da Lidiane é `16:55:03Z`, batendo com a varredura do cron, não com a última
   mensagem (16:20) — ou seja, a sessão ficou aberta e foi fechada pelo caminho de
   abandono, o fast-path `post_session_immediate` não rodou. A tag não saiu (ou saiu e foi
   bloqueada). Ajuste em duas camadas:
   - **Prompt:** nos blocos de fechamento, a tag é parte inseparável de qualquer formato de
     aterrissagem — inclusive "pergunta-pra-carregar", hoje o mais propenso a terminar em
     pergunta sem tag.
   - **Rede de segurança em código (crítica aceita).** Confiar só no prompt repetiria o erro
     de origem. O arquivo já tem o precedente certo na linha ~7018-7021 (conversão automática
     de `[CONVERSA_CONCLUIDA]` → `[ENCERRAR_SESSAO]`). Mesma lógica aqui: se a fase é
     `closing` (ou o tempo de sessão já passou do limite) e a mensagem tem cara de fechamento
     — resumo/despedida, sem pergunta de continuidade — e a tag não veio, o código força a
     tag antes do processamento, com `console.log` para medir a frequência. Se essa rede
     disparar com frequência alta, é sinal de que o prompt de fechamento ainda está fraco.


## O que foi verificado antes de fechar este plano

- As 5 ocorrências do molde existem e são literais: linhas 1069, 1086, 1439, 1722 e 3216 do
  `aura-agent/index.ts`.
- `evaluateTherapeuticPhase()` não tem nenhum campo de estado de hipótese; o
  `lastUserContext` do extractor não carrega nada equivalente.
- Bloco de agenda (linha 6557 / cabeçalho 6579) sem `sessionActive` nem checagem de fase.
- `sessions.closure_type = 'pergunta-pra-carregar'` foi preenchido pelo `session-extractor`
  (é ele quem grava o campo), então não serve como prova de que a tag foi emitida — o
  `ended_at` no minuto do cron é a prova de que não foi.

## Detalhes técnicos

- Itens 1, 2, 3, 5, 6, 7 e 9 são prompt no `supabase/functions/aura-agent/index.ts`.
- Item 4 toca o schema do micro-agent extractor (2 booleanos) e a condição
  `recentPairs >= 5 && detectedPhase === 'sentido'` no `evaluateTherapeuticPhase()`.
- Item 8 é a condição da linha 6557 mais o tom do bloco 6579.
- `session-reminder/index.ts` não precisa de mudança: o fallback funcionou como projetado;
  o furo é a tag não sair do agente.
- Os testes em `aura-agent/phase_thresholds_test.ts` que hoje afirmam a presença de textos
  literais precisam ser atualizados junto (passam a checar intenção, não frase).

