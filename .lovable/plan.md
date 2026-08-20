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
   vezes. Se a pessoa já validou, seguir adiante em vez de reoferecer; e parar de reinjetar
   a instrução de "entregar hipótese" quando a tese já apareceu no histórico recente.



4. **Correção do usuário vence a hipótese.** Quando a pessoa corrige a leitura, a Aura
   incorpora a palavra dela e reformula a partir dali, sem devolver a versão anterior.
5. **"Não sei" duas vezes = trocar de camada.** Em vez de reafirmar a tese, ir pra origem
   e história concreta (quando começou, com quem mais isso já aconteceu).
6. **Fechamento com apoio quando há ativação aguda.** Se a última fala do usuário indicar
   dor viva ("eu não queria sentir isso"), o fechamento inclui algo pra atravessar a noite,
   não só a pergunta pra carregar.


## Um ponto a verificar antes de mexer

O pedido de nota saiu às 13:55 BRT, 35 minutos depois da última mensagem do fechamento
(13:20), e o `ended_at` da sessão está marcado em 13:55. Ainda não confirmei se isso é
atraso do encerramento (sessão seguiu "aberta" até o cron fechar) ou da rotina de rating.
Primeiro passo: checar o encerramento no `session-reminder`/ciclo de vida e, se for atraso
de encerramento, encerrar a sessão no momento do fechamento e pedir a nota em seguida.

## Detalhes técnicos

- Alterações 1–5 são no prompt do `supabase/functions/aura-agent/index.ts` (blocos de
  cardápio de fechamento, CRIAR_AGENDA e regra anti-loop), sem novo código de fluxo.
- Item de verificação toca `supabase/functions/session-reminder/index.ts` e o cálculo de
  `ended_at`; só mexer depois de confirmar a causa nos dados.
