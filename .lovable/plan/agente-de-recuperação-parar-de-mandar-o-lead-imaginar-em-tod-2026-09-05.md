# Agente de recuperação: parar de mandar o lead "imaginar" em toda mensagem

## O que está acontecendo (confirmado no código)

Na conversa da Ana Paula ela já tinha decidido ("Sim segunda vou fazer", "Ok até segunda") e mesmo assim recebeu duas mensagens longas seguidas com cena hipotética: "E já pensando nos primeiros dias: bateu ansiedade..." e "Mas já pra ir imaginando, pensa no dia em que você não conseguir desligar a cabeça...".

A causa está em três regras do agente:

1. A regra das "duas camadas" obriga **toda** resposta a mostrar uma cena da vitrine, mesmo quando o lead só está confirmando, agradecendo ou marcando data. Não há nenhuma condição que desligue a cena.
2. A detecção de mensagem curta só reconhece saudação/agradecimento ("oi", "ok", "obrigada") com até 3 palavras. "Sim segunda vou fazer" e "Ok até segunda" não entram — então o agente trata como se ainda precisasse vender.
3. Nada proíbe o enquadramento hipotético. Como a cena é obrigatória e não há situação real pra ancorar, o modelo inventa uma: "imagina", "pensa no dia em que", "já pensando nos primeiros dias".

## O que muda

**1. Quem já decidiu recebe confirmação curta, e ponto.** Nova leitura de "lead já decidido" (diz que vai fazer, marcou dia, "depois eu faço", "vou assinar segunda"): resposta de no máximo 2 frases, confirmando e se colocando à disposição — sem cena, sem vitrine, sem link, sem tag. Nada de vender pra quem já disse sim.

**2. A cena de valor deixa de ser obrigatória e passa a ter gatilho e cooldown.** Cena só entra quando o lead realmente está em dúvida, objeção, comparação ou pergunta sobre o que a Aura é/faz. E no máximo **uma cena a cada duas mensagens nossas**: se a última resposta do agente já trouxe cena, a seguinte responde só o que foi perguntado. Cena repetida em sequência passa a ser erro.

**3. Enquadramento hipotético fica proibido.** "imagina", "pensa no dia em que", "já pensando nos primeiros dias", "vamos supor", "suponha", "quando bater X" deixam de ser permitidos: a cena só pode ser contada quando ancorada em algo que o lead disse (ele falou de sono, de ansiedade, de tempo). Além da instrução, entra uma rede de segurança que remove a frase quando o modelo insistir.

**4. Reconhecimento de fechamento mais largo.** A lista de mensagens curtas passa a cobrir "sim", "beleza", "perfeito", "combinado", "tá", "certo", "entendi", "fechado", "até segunda" e frases de até 5 palavras com esse sentido.

**5. Teto de tamanho fora de pergunta de valor.** Sem pergunta explícita sobre valor/como funciona: máximo 3 frases e um parágrafo. Duas mensagens longas em sequência ficam bloqueadas.

## Detalhes técnicos

Arquivo único: `supabase/functions/recovery-agent/index.ts`.

- `isShortGreeting`: ampliar tokens e limite para 5 palavras; extrair também `isDecided(text)` (regex de intenção futura declarada: `vou (fazer|assinar|entrar|pagar)`, `(na|até) (segunda|terça|...|semana que vem)`, `depois eu`, `amanhã eu`, combinada com ausência de "?" e de objeção).
- Novo `decidedInstruction` (2 frases, sem cena/vitrine/link/tag), injetado antes de `modeInstructions`; quando ativo, o bloco `O QUE ... GANHA` não é renderizado (mesma condição de `blankDoubt` na linha ~698).
- `modeInstructions` (branch lead): "DUAS camadas" passa a ser condicional — cena só com gatilho (dúvida/objeção/comparação/pergunta de valor) e só se a última mensagem da Aura no histórico não tiver cena; acrescentar proibição explícita de enquadramento hipotético e o teto de 3 frases.
- `sceneUsedRecently(historyAsc)`: verifica a última mensagem `out` contra os `probe` de `VALUE_SHOWCASE`; quando verdadeiro, injeta instrução "sem cena nesta mensagem".
- Nova rede de segurança de pós-processamento, ao lado de `RE_DIMINISH` (linha ~778): `RE_HYPOTHETICAL` remove frases que abrem por "imagina/pensa no dia/já pensando/vamos supor/suponha".
- Deploy de `recovery-agent`. Sem mudança de schema, sem tocar em templates, taster, dunning ou nas travas de PIX/link.

## Fora do escopo

Régua de templates proativos, cap de 30 dias, base de conhecimento e fluxo de dunning permanecem como estão.
