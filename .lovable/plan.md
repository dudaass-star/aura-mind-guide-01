# Por que a Aura repetiu "por onde começamos?" — diagnóstico com evidência

## O que aconteceu na sessão da Marilene (27/08, 12:05–12:49)

Ela definiu o foco na 3ª troca ("Hoje é a mágoa...", 12:11:42). Mesmo assim, a pergunta de foco reapareceu ao longo de toda a sessão:

```text
12:07:13  "Por onde você sente..."                          (1ª resposta da sessão)
12:10:13  "Se a gente fosse escolher UM desses..."
12:12:13  "Vamos focar nessa mágoa hoje?"
12:23:11  "...você sente que esse é o ponto pra gente começar hoje?"
12:23:48  "Entre essa autonomia, o financeiro ou a paz... por onde começamos hoje?"
```

Note que a primeira pergunta de foco saiu já na **primeira** resposta da sessão, antes de haver qualquer material acumulado — isso é a pista do que está errado.

## Causa real (não era o avaliador de fases terapêuticas)

Essa sessão era a **primeira sessão** da Marilene (e a da Cleide também — as duas com zero sessões concluídas antes). Para primeira sessão existe um caminho separado no código: um "onboarding estruturado" de 5 fases que **substitui** a condução normal.

Duas falhas se somam nesse caminho:

1. **A fase 5 não tem saída.** As fases são escolhidas por um `if/else` sobre a contagem de respostas da Aura: 0 → apresentação, ≤2 → explicar, ≤4 → conhecer, ≤6 → aliança, **e todo o resto cai no `else` = "FASE 5: DEFINIR PRIMEIRO TEMA DE TRABALHO"**, cujo texto injetado diz literalmente "OBJETIVO: escolher por onde começar" e traz a pergunta pronta como exemplo. Não existe nenhuma condição que tire a sessão dessa fase. Ou seja: da 7ª resposta até o fim da sessão, **todo turno** recebeu a ordem de perguntar por onde começar.

2. **A contagem não é da sessão.** A variável se chama `assistantMessagesInSession`, mas conta as respostas da Aura dentro da janela das últimas ~40 mensagens da conversa inteira — inclusive as de antes da sessão (a Marilene tinha várias, do agendamento às 11:57). Por isso a sessão já **começou** dentro do `else`, na fase 5, e nunca saiu.

3. **Nada registra que o foco foi definido.** `focus_topic` está NULL nas duas sessões. O tema só aparece depois, no `theme_label` gerado pelo extrator no fim ("Autonomia, isolamento e resgate da dignidade"). Durante a sessão não há nenhum estado dizendo "o foco já é X", então nem o prompt nem o código tinham como saber que o objetivo estava cumprido.

Resumo em uma frase: **a Aura não deixou de entender o foco — ela recebeu, em todos os turnos, uma instrução fixa mandando definir o foco, porque a fase de onboarding da primeira sessão é um estado sem porta de saída e o contador que a escolhe conta mensagens de fora da sessão.**

## Correção proposta (ataca a causa, não o sintoma)

1. **Contar só o que é da sessão.** Trocar a contagem pela quantidade de respostas da Aura *dentro* da sessão atual (a partir de `started_at`), para as fases de onboarding avançarem no ritmo real.

2. **Dar saída à fase 5.** A fase de foco vira um estado que **termina**: assim que o foco for definido, o bloco injetado passa a ser "o foco de hoje é X — aprofunde; não pergunte de novo por onde começar", e a sessão segue na condução normal (que já existe e funciona nas sessões seguintes).

3. **Gravar o foco quando ele acontece.** Persistir `focus_topic` no momento em que o usuário escolhe o tema (uma tag simples de saída ou a detecção que o extrator já faz), para que exista estado real — é isso que permite a saída do item 2 e evita que o problema volte por outro caminho.

Sem inventar nova complexidade para o modelo: os três itens são de código/estado, não de prompt. A única mudança de prompt é o bloco de foco deixar de ser injetado depois que o foco existe.

## Os outros pontos das duas sessões (independentes deste)

- **Menções a minutos** no prompt ("faltam 10 minutos") cortando momento emocional — remover a fala, manter o controle interno de tempo.
- **Pedido de nota atropelando a despedida** (chegou ~5s antes da última fala) — incluir a idade da última mensagem entregue na trava.
- **Resíduo visual** de bolhas com ". . ." vindo do split por `|||` — sanear fragmentos só com pontuação.

## Detalhes técnicos

- `supabase/functions/aura-agent/index.ts`: bloco `isFirstSession` (~6025-6130) — recontar assistentes por sessão, adicionar condição de saída da fase `focus`, gravar `focus_topic`; remover instrução de minutos (~4022) e ajustar avisos de fase (~1617/1635).
- `supabase/functions/session-reminder`: idade da última mensagem na condição de disparo do rating.
- Saneamento no split de mensagens + testes unitários cobrindo fase de foco encerrada e split limpo.
