# "Ficou uma dúvida" deve virar pergunta, não palestra

## O que aconteceu (verificado no código)

O clique no botão "Ficou uma dúvida" chega como texto e é classificado em `pix-buttons.ts` (`RE_DOUBT`) como `conversational`. Isso liga o bloco `copiedPixInstruction` no prompt, que manda o agente "tratar a dúvida específica dela de frente" — só que não existe dúvida dita. Somado às duas camadas obrigatórias (destrava + cena de valor) e à instrução de até 5 frases quando o tema é PIX Automático, o modelo **adivinha** a dúvida e despeja explicação de PIX + valores + link. Foi exatamente isso na conversa do +55 73 8188-7291.

O `shortAckInstruction` (que limita a 2 frases) não pega esse caso: `isShortGreeting` cobre "ok/obrigada/beleza", não "Ficou uma dúvida".

## O que muda

### 1. Novo estado: dúvida em branco
Quando a mensagem do lead é só a **declaração** de dúvida sem conteúdo — clique do botão "Ficou uma dúvida", "tenho uma dúvida", "queria tirar uma dúvida", "posso perguntar uma coisa?" — o agente responde com **uma frase curta perguntando qual é a dúvida**. Nada mais: sem explicar PIX, sem valores, sem cena de valor, sem link, sem taster.

Exemplo do tom desejado: "Claro, Almirene — qual ficou?" / "Manda a dúvida que eu te respondo agora."

Isso vale mesmo dentro do trilho "copiou o código PIX": nesse caso o `copiedPixInstruction` é suprimido, porque ele é justamente o bloco que empurra o agente a supor a trava.

### 2. Regra geral anti-adivinhação no prompt
Regra nova: nunca responder a uma dúvida que o lead não formulou. Se a mensagem não diz **qual** é a dúvida, pergunte — uma pergunta, curta, sem antecipar assunto e sem lista.

### 3. Se ele já disse a dúvida, nada muda
O comportamento atual (destrava + uma cena do nível A) continua igual quando existe pergunta concreta. Só o caso "dúvida sem conteúdo" ganha caminho próprio.

### 4. Segunda mensagem sim resolve
Quando ele responder dizendo qual é a dúvida, o fluxo normal segue: o histórico já mostra que o agente perguntou, então ele responde direto ao ponto, sem repetir a pergunta.

## Detalhes técnicos

- `supabase/functions/recovery-agent/pix-buttons.ts`: separar `RE_DOUBT` em dois — `RE_DOUBT_BLANK` (declaração vazia de dúvida, inclui o texto do botão) e o resto ("vou pagar agora") continua `conversational`. Novo valor de intent `doubt_blank` ou flag exportada `isBlankDoubt(text)` — decidir pelo menor impacto nos call sites existentes.
- `supabase/functions/recovery-agent/index.ts`:
  - calcular `blankDoubt` junto de `shortAck` / `mediaOnly`;
  - quando `blankDoubt`: injetar um `blankDoubtInstruction` que sobrepõe as duas camadas (1 frase, só pergunta, sem link, sem vitrine, sem tag `[ENVIAR_LINK]`/`[OFERECER_TASTER]`), e **não** injetar `copiedPixInstruction`, `tasterInstruction` nem o bloco `O QUE ... GANHA`;
  - manter o bypass determinístico dos outros botões (`new_code`, `already_paid`) intacto;
  - adicionar em `modeInstructions` a regra anti-adivinhação (vale também fora do caso do botão).
- Não mexer em guards (usuário ativo, quiet hours, `max_auto_replies`), envio Twilio, gravação em `recovery_messages` nem na KB.
- Deploy da edge function `recovery-agent` e teste com o texto exato do botão para conferir que sai só a pergunta curta.
- Memória do projeto: registrar a regra "nunca responder dúvida não formulada" na nota do recovery-agent.
