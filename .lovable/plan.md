# Agente de recuperação: parar de explicar PIX sem ser perguntado e de colar o link em tudo

## O que os dados mostram (últimos 7 dias, respostas automáticas)

- 45 respostas do agente. **28 delas (62%) terminaram com o link do checkout.**
- **18 delas (40%) falaram de autorização / 8º dia / PIX Automático**, incluindo casos como o da tela que você mandou: o lead escreveu só "Não tenho dinheiro" e recebeu explicação de autorização + link.

## Por que isso acontece

Três coisas empurram o agente pra isso, e todas são regra escrita por nós:

1. **A explicação do PIX está sempre no material que o agente recebe.** Todo prompt leva um bloco fixo de valores com o texto "o valor que o banco mostra é autorização, o débito começa no 8º dia", mais uma seção inteira de objetivos sobre PIX Automático, mais "fatos que mais destravam" sobre autorização. Além disso, a base de conhecimento injeta sempre a categoria de dúvidas técnicas, que hoje tem 16 itens — a maioria sobre PIX Automático. É o assunto mais presente na mesa, então é o assunto que sai.
2. **Uma instrução manda falar de cobrança sempre que houver "trava".** Existe uma linha dizendo que, se a trava envolver cobrança, ele deve deixar claro o valor de hoje e a autorização futura. "Não tenho dinheiro" é lido como cobrança, e vira aula de PIX.
3. **O link é descrito como padrão.** A regra da tag de link diz literalmente "padrão quando a conversa avança ou a dúvida foi resolvida", e há outra instrução que trata o link como parte da estrutura da mensagem ("a última linha antes do link"). Até em "ok/obrigada" o agente é instruído a mandar o link.

## O que vai mudar

### 1. PIX Automático só quando o lead abre o assunto
- O bloco de valores passa a ter duas versões: **completa** (com autorização e 8º dia) só quando a mensagem do lead, ou o histórico recente, tocar em cobrança automática, banco, autorização, débito, recorrência, valor na tela; e **enxuta** (só "hoje sai R$ X, mensalidade R$ Y") no resto dos casos.
- Os itens de dúvida técnica sobre PIX deixam de entrar sempre: passam a entrar por relevância (palavra do lead ou contexto de "copiou o código"). As categorias de sempre continuam com preço, garantia, como funciona, benefício, segurança e objeção.
- Regra nova e explícita no prompt: **não explicar PIX Automático, autorização ou 8º dia se o lead não perguntou** — nem "de bônus" no fim da mensagem.
- "Não tenho dinheiro / está apertado" ganha tratamento próprio: reconhecer, dizer o valor que sai hoje em uma frase e — se elegível — oferecer o encontro avulso; sem aula de autorização bancária.

### 2. Link deixa de ser padrão
- A tag de link passa a ser **exceção com condição clara**: só quando o lead pede o link, diz que vai pagar/quer continuar, ou quando a dúvida que travava foi resolvida **e o link ainda não foi enviado nesta conversa**.
- Trava no backend (não depende do bom comportamento do modelo): se o link já saiu numa mensagem nossa nas últimas 24h e o lead não pediu explicitamente, o link **não é anexado** de novo.
- Em mensagem curta ("ok", "obrigada"): responder em uma ou duas frases e **não** mandar link.
- Sai a instrução que trata o link como parte da estrutura da mensagem; a mensagem termina em pergunta ou convite, com ou sem link.

### 3. Ajuste de tom
Fechamento passa a ser uma pergunta concreta ("quer que eu gere o código agora?"), não uma URL solta. Assim o link volta a ser resposta a um pedido, não assinatura de robô.

## Detalhes técnicos

- `supabase/functions/recovery-agent/index.ts`:
  - `renderPlanValues` ganha parâmetro `pixContext: boolean`; nova regex de detecção de assunto-cobrança sobre `text` + histórico curto.
  - `ALWAYS_CATEGORIES`: remover `duvida_tecnica`; itens dessa categoria passam pelo caminho de pontuação por keyword de `loadKb` (com bônus quando `pix_copied_at`/`pixIntent`).
  - `modeInstructions`: remover a linha "Se a trava envolve cobrança…" e a linha "A última linha antes do link…"; incluir a regra anti-explicação-não-pedida e a regra de link condicional.
  - `shortAckInstruction`: deixar de pedir `[ENVIAR_LINK]`.
  - Gate no parse de tags: `sendLink` só vale se o lead pediu (regex) ou se nenhum outbound com `CHECKOUT_URL` nas últimas 24h (consulta a `recovery_messages`); log do motivo da supressão.
- `recovery_agent_config.system_prompt` (`UPDATE` em id 1): reescrever a seção de PIX como condicional, reescrever a descrição de `[ENVIAR_LINK]` (deixa de ser "padrão"), e remover a linha final sobre "última linha antes do link". Sem tocar em `enabled`, `model`, `max_auto_replies` ou horário silencioso.
- Deploy de `recovery-agent`. Sem mudança de schema, de fluxo Twilio ou das travas de verdade/anti-upsell.

## Fora do escopo
Régua de templates proativos, taster e dunning continuam como estão.
