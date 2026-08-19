# Aura útil no dia a dia + corte de assunto em 30 min

Sim — retomar continua possível. O histórico recente permanece no contexto em qualquer faixa abaixo de 48h; a regra de 30 min não apaga nada, só muda **quem escolhe o assunto**. Se o usuário voltar e puxar o tema anterior, a Aura tem tudo em mãos e retoma de onde parou.

Nenhum modo novo, nenhum detector novo, nenhum KPI novo.

## Revisão completa: 5 travas reais no código

Fiz a varredura que faltava. São cinco pontos, e três deles eu não tinha visto antes — inclusive o mais forte.

**Trava 1 — `# ESCOPO E LIMITES (O QUE VOCÊ NÃO FAZ)` (~2665-2684).** A mais forte, e a que eu tinha deixado passar. Diz literalmente "Você é especialista em EMOÇÕES e RELACIONAMENTOS. Ponto.", lista finanças, nutrição, tecnologia, direito, marketing e medicina como fora da área, e manda: **"Não ajude. Não dê 'só uma dica'. Não crie conteúdo técnico 'só dessa vez'."** Traz até a resposta pronta "Isso não é bem minha praia, sabe? 😅". Sem reescrever isso, qualquer regra de utilidade em outro bloco é atropelada.

**Trava 2 — `ABERTURA LEVE DETECTADA` (~6595-6623).** Injeção determinística: qualquer mensagem com **8 palavras ou menos** e sem palavra de carga emocional cai nela. "pilates faz mais efeito que musculação?" tem 6 palavras e nenhuma palavra emocional — cai. E o bloco manda "responda APENAS ao que foi dito: cumprimente de volta + 1 devolutiva curta", **máximo 2 balões**. Ou seja: hoje o sistema trata pergunta prática curta como se fosse "oi". Esta é provavelmente a causa direta do caso do pilates, mais até que o prompt.

**Trava 3 — `## MODO PING-PONG` (~3081-3090).** Ele já desliga os guardrails de profundidade (bom), mas está escrito como "reagir breve e devolver a bola" — não autoriza **responder de fato**. E impõe **máximo 300 caracteres** em troca leve. Uma resposta útil de verdade (ideia de receita, comparação, passo a passo curto) não cabe em 300 caracteres. Além disso a classificação fora de sessão só reconhece dois sinais — leve/factual e carga emocional — e pergunta prática não é nem um nem outro.

**Trava 4 — Phase Evaluator: a "rede de segurança" de mudança de tema é, ela mesma, uma trava.** Há duas camadas aqui, e a revisão externa acertou a existência da primeira mas errou o efeito dela:

- Camada semântica (`topic_continuity`, linhas 1295-1305): quando o micro-agente marca `shifted`/`new_topic`, o evaluator realmente reseta a estagnação — mas **injeta** o bloco `🔄 MUDANÇA DE TEMA DETECTADA` que manda: *"Antes de interpretar ou aprofundar emocionalmente: 1. Acolha brevemente 2. Pergunte sobre a SITUAÇÃO concreta: 'O que tá acontecendo?' / 'Me conta mais sobre isso' 3. Só após entender o contexto, aplique as fases normais."* Numa pergunta prática isso é exatamente o comportamento errado — vira sondagem clínica em cima de "pilates x musculação". Então essa camada não protege a utilidade: ela atrapalha. E o `last_user_context` vem do **turno anterior**, então chega com um turno de atraso.
- Camada por keyword (linhas 1634-1668), atingida quando o micro-agente não classificou nada naquele turno: olha as **mensagens recentes da própria Aura**; se as falas dela ainda têm vocabulário de profundidade, segue injetando "AÇÃO OBRIGATÓRIA: traga UMA observação concreta / pergunta-âncora da Logoterapia".

Ou seja: os dois caminhos precisam do mesmo desarme, e não há mecanismo paralelo sendo empilhado — o `if` de pergunta prática entra **antes** de ambos, e o `topic_continuity` continua fazendo todo o resto do trabalho dele (reset de estagnação, cap de `recentPairs` na linha 1441) intacto.

**Trava 5 — Contexto temporal só existe acima de 4h (~5977).** Abaixo de 4h nenhuma instrução é dada e o histórico pesado segue no contexto, então o modelo puxa o assunto anterior de volta.

**Verificado e OK (não precisa mexer):** `REGRA DE VALOR` e `GUARDRAIL SIMÉTRICO` já estão explicitamente desativados em PING-PONG; `FECHAMENTO RECOMENDADO`, `PADRÃO RECORRENTE` e continuidade de sessão já são gated por `sessionActive`; insights já estão marcados como contexto passivo ("se o usuário fala de filme, fale de filme"). O limite de 5 balões e a regra "UMA pergunta por resposta" não estorvam utilidade.

## Parte 1 — Destravar a utilidade

### 0. Reescrever `ESCOPO E LIMITES` em dois níveis (o ajuste principal)
Hoje é uma lista única de "não faço". Passa a separar:

**Papo do dia a dia — pode e deve ajudar** (conversa informada de amiga, sem virar consultoria): ideia de receita, dica de organização e rotina, sugestão de filme/livro/presente, como funciona algo, opinião sobre uma decisão comum, comparação simples tipo pilates x musculação, ajuda pra escrever uma mensagem difícil, controle de gastos no dia a dia.

**Continua sendo NÃO** (entrega profissional/regulada, onde errar tem custo real): diagnóstico, dose ou troca de medicação; plano de dieta ou cálculo de macros; recomendação de investimento, produto financeiro ou imposto; parecer jurídico ou revisão de contrato; construir prompt, agente de IA, código ou sistema; plano de marketing/vendas. Nesses casos: pode conversar sobre o assunto e o que está em jogo, mas não entrega o produto técnico — nomeia o limite em uma frase e sugere o profissional.

A resposta pronta "não é bem minha praia" sai da posição de padrão e passa a valer só para o segundo nível. O "POR QUÊ" também muda: o valor dela é ser a amiga que entende de gente **e está por perto no dia comum** — não uma assistente genérica, mas também não alguém que se recusa a responder o óbvio.

### 0b. Corrigir o `ABERTURA LEVE DETECTADA` (trava 2)
O bloco continua existindo — ele resolve bem o problema do "Oi". Só passa a **não** disparar quando a mensagem curta é uma pergunta prática. Mensagem curta que não é pergunta continua exatamente como hoje.

Uma única função nova, ao lado dos regex que já existem lá:

```ts
// true quando a mensagem é pergunta prática (dúvida do dia a dia), não desabafo
function isPracticalQuestion(msg?: string | null): boolean {
  const t = (msg ?? '').toLowerCase().trim();
  if (!t) return false;
  if (EMOTIONAL_LOAD_REGEX.test(t)) return false;   // constante que já existe
  return t.endsWith('?') || /^(o que|qual|como|quando|onde|quanto|vale a pena|você sabe|vc sabe|me indica|tem alguma|é melhor|faz mal|pode|dá pra|da pra)\b/.test(t);
}
```

Essa mesma função é reutilizada no item 1b. É a única peça de código nova de todo o plano. Assinatura tolerante a `undefined`/vazio de propósito: os dois pontos de chamada recebem `message` cru.

**Expansão obrigatória do `EMOTIONAL_LOAD_REGEX`.** Como esse regex passa a sustentar três decisões em vez de uma, e `endsWith('?')` é abrangente, frases relacionais escapariam da rede: "cadê você?", "você ainda gosta de mim?", "por que você sumiu?", "ele me traiu?". Antes de usar a função, o regex ganha termos relacionais e de ruptura: `sumi|gosta de mim|me ama|\bama\b|tra[ií]|termin|brig|discut|ignor|larg|abandon|sauda|ciúm|arrepend|fracass|vergonh|insegur`. A lista de padrões interrogativos também deixa `por que` de fora de propósito — "por que eu sou assim?" não é pergunta prática.

### 1. Uma regra de utilidade dentro do PING-PONG (que já existe)
Acrescentar 4 ou 5 linhas ao bloco que já está lá:
- Pergunta prática (dúvida, informação, ideia, receita, dica, opinião, "como faz X") → **responde a pergunta**, direto e útil, como uma amiga que sabe do assunto.
- Nesse caso o teto de 300 caracteres não vale: pode usar até ~800 caracteres, o que a resposta precisar pra ser realmente útil. Continua valendo o máximo de 5 balões.
- Responder é a entrega. Não precisa de gancho emocional, nem de pergunta de volta, nem de leitura psicológica.
- Não devolver a pergunta como material clínico. Se houver algo emocional de verdade por trás, ela responde primeiro e só depois, se couber, comenta em uma frase.
- Saúde/jurídico/financeiro: opinião informada + sugerir profissional, nunca como verdade.

### 1b. Desarmar o Phase Evaluator quando o usuário muda de assunto (trava 4)
Na conversa livre, se `isPracticalQuestion(última mensagem do usuário)` for verdadeiro, o evaluator sai com `ping-pong` e sem guidance — exatamente o mesmo caminho de saída que ele já usa hoje quando não detecta profundidade. Uma linha de `if` no começo do ramo FREE CONVERSATION, nenhum threshold alterado. Nada muda quando o usuário está de fato em tema pesado.

### 2. Trocar o exemplo errado por um certo
A seção Anti-Rodeio já ensina brevidade. Ganha um exemplo de utilidade no mesmo formato dos que já estão lá, usando o caso real do pilates: pergunta prática → resposta prática.

### 3. Uma frase de contrapeso na Postura Clínica
Hoje ela lê `Você não é assistente do humor do usuário. Você é a presença clínica dele.` Fica, mas com uma frase ao lado: ser presença inclui ser companhia e ser útil no dia comum; profundidade é quando a pessoa traz peso, não a marcha default.

## Parte 2 — Corte de assunto aos 30 min (fora de sessão)

Fecha a trava 5. Hoje o contexto temporal só fala quando o gap passa de 4h; abaixo disso nada é dito e o modelo tende a puxar o assunto pesado anterior de volta.

Novo comportamento, só quando **não** há sessão agendada rodando:

```text
< 30 min    continuação imediata (igual hoje)
30 min-4h   NOVA regra: a mensagem atual do usuário define o assunto.
            Responde o que ele trouxe agora, não reabre o tema anterior
            por conta própria. Se ELE retomar, retoma com naturalidade
            e com toda a memória do que já foi dito.
4h+         faixas atuais (4-24h, 24-48h, 48h+) sem mudança
```

Dentro de sessão agendada nada muda — lá a lógica de retomada e as 4 fases continuam mandando.

## O que NÃO muda

- Nada dentro de sessão agendada.
- Nenhum guardrail de profundidade é enfraquecido: em tema pesado, tudo continua igual.
- O bloco de "Oi" continua fazendo o que faz hoje para saudação e mensagem curta que não é pergunta.
- Histórico, insights e memória continuam carregados — retomar é sempre possível.
- Sem tabela nova, sem cron, sem painel, sem KPI novo. As duas mudanças de lógica (0b e 1b) são condições dentro de blocos que já existem.

## Checagem de simplicidade

Contabilizando o que a implementação realmente adiciona:

| Item | Tipo | Tamanho |
|---|---|---|
| `ESCOPO E LIMITES` em 2 níveis | texto do prompt | reescrita de bloco existente |
| Regra de utilidade no PING-PONG | texto do prompt | +5 linhas |
| Exemplo no Anti-Rodeio | texto do prompt | +2 linhas |
| Frase na Postura Clínica | texto do prompt | +1 linha |
| `isPracticalQuestion()` | código | 1 função, ~5 linhas |
| Gate do `ABERTURA LEVE` | código | 1 condição a mais |
| Saída antecipada do evaluator | código | 1 `if` |
| Faixa temporal 30 min | código | troca de `>= 4` por `>= 0.5` + 1 `else if` |

Nenhum modo novo, nenhum estado novo, nenhuma tabela, nenhum campo, nenhuma chamada extra de LLM, nenhuma latência adicional. Só uma função pura de string usada em dois pontos.

**Riscos e contenção:**
- *Falso positivo em desabafo em forma de pergunta* ("por que eu sou assim?") — contido: `isPracticalQuestion` retorna `false` se houver qualquer palavra de carga emocional, e o padrão `por que` fica de fora da lista de propósito.
- *Aura virar assistente genérica* — contido pelo segundo nível do `ESCOPO E LIMITES`, que mantém o "não" nas entregas técnicas/reguladas.
- *Perder profundidade em tema pesado* — nenhuma das mudanças toca o caminho com carga emocional nem o caminho de sessão ativa.
- *Rollback* — as 4 edições de texto e os 4 pontos de código são independentes entre si; qualquer um pode ser revertido isolado sem quebrar os outros.
- Protocolo de segurança e limites (não dar orientação médica/jurídica como verdade) continuam valendo — a regra de utilidade diz explicitamente pra ela não passar de opinião informada nesses casos.

## Detalhe técnico

Tudo em `supabase/functions/aura-agent/index.ts`:
- **Texto:** `# ESCOPO E LIMITES` (~2665-2684, reescrito em dois níveis), `## MODO PING-PONG` (~3081-3090), `Anti-Rodeio` (~2813-2815), `# POSTURA CLÍNICA` (~2823).
- **Lógica (3 pontos pequenos):**
  - `isLightMessage` / bloco `ABERTURA LEVE DETECTADA` (~6602-6623): adicionar `PRACTICAL_QUESTION_REGEX` e excluí-la do gate.
  - `evaluateTherapeuticPhase`, ramo FREE CONVERSATION (~1634-1668): mesma checagem na última mensagem do usuário antes de injetar guidance de fase.
  - `CONTEXTO TEMPORAL SERVER-SIDE` (~5977): gatilho de `>= 4` para `>= 0.5`, com instrução própria para a faixa 0,5-4h e guarda `!sessionActive` nessa faixa.

## Verificação pós-implementação (explícita, não genérica)

`phase_thresholds_test.ts` faz regex sobre o texto-fonte — ele só garante que nenhuma âncora de texto foi apagada, **não** que a lógica nova funciona. Então:

1. **Teste de comportamento novo** (`practical_question_test.ts`, na mesma pasta, mesmo estilo Deno): tabela de casos contra `isPracticalQuestion` — devem dar `true`: "pilates faz mais efeito que musculação?", "como faço arroz de forno?", "me indica um filme bom", "vale a pena trocar de celular?"; devem dar `false`: `undefined`, `''`, "oi", "cadê você?", "por que eu sou assim?", "tô muito ansiosa hoje", "você ainda gosta de mim?". Para isso a função é **exportada**.
2. **Rodar `phase_thresholds_test.ts`** para confirmar que `TAMANHO CONTEXTUAL`, `600 caracteres` e os thresholds do evaluator continuam presentes.
3. **Guarda anti-500:** os dois pontos de chamada ficam dentro do fluxo normal, e a função nunca lança (entrada nula tratada). Nenhum `try/catch` novo é necessário porque não há I/O — mas o padrão do projeto (fallback opcional nunca derruba a resposta) é respeitado por construção.
4. **Deploy com verificação de drift:** commits em `supabase/functions/**` às vezes não disparam o workflow. Após publicar, republicar manualmente se necessário e rodar nos primeiros 5 minutos:
   ```sql
   select created_at, left(error,200) from failed_message_log
   where created_at > now() - interval '10 minutes'
   order by created_at desc;
   ```
5. **Prova em conversa real:** mandar "pilates faz mais efeito que musculação?" e confirmar nos logs que `ABERTURA LEVE DETECTADA` **não** foi injetado e que o evaluator saiu como `ping-pong` sem guidance.