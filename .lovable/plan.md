# Caso Elisabete (Toshioka) — foi falha nossa ou desencaixe da usuária?

## Veredito

**Foi majoritariamente falha nossa.** Houve também um desencaixe real de expectativa (ela queria orientação prática e rápida; recebeu condução socrática lenta), mas o gatilho do cancelamento veio de três falhas concretas da Aura, todas registradas no banco.

## Evidências (consultadas agora)

Perfil: `96543755-e6a0-4cb9-85dc-7acc377fb517`, Essencial, entrou 15/08, acesso expirou 22/08, 2 sessões concluídas (15/08 e 22/08), última mensagem dela 22/08 13:03.

**1. Correções de memória: 39 em duas sessões** — número altíssimo para 7 dias de uso. Delas, **9 são sobre o mesmo pedido não atendido: falar por áudio** ("AURA não está respeitando o combinado sobre a conversa por áudio", "Não falar em texto quando o combinado for áudio", etc.). Ela pediu áudio 4 vezes (15/08 11:45, 11:46, 12:08; 22/08 12:24 e 12:51) e seguiu recebendo texto fora dos 2 áudios automáticos de abertura de sessão.

**2. Interpretação precoce e imposta — a usuária corrigiu 3 vezes na mesma sessão:**
- Aura: "Se você grita, sua fúria vira o foco" → ela: "Eu não grito, em nenhum momento afirmei isso".
- Aura insistiu que a expressão dela era estratégia/conivência → ela: "isso não é proposital", "acho que você não entendeu".
- Aura: "você virou a personificação do medo e não da técnica" → ela: **"Vc está me julgado?"**. Depois disso ela não voltou ao tema; no fechamento respondeu "Nada. Não teve nada além do que eu já sabia".

**3. A auditoria automática da própria sessão dá nota 2/5** (`session_coverage_analyses`): 4 camadas investigativas não cobertas, fase de movimento falha, red flags `reframe_imposto_sem_hipotese`, `fechamento_forcado_sem_material`, `concordancia_passiva_tratada_como_reflexao`, `interrupcao_fase_presenca`.

**4. Ruídos operacionais** — latência alta reclamada 5 vezes dentro da sessão; mensagem solta "E aí" enviada 13:20 (17 min após o encerramento); às 13:40 pedido de nota; no dia seguinte cobrança do compromisso "Termômetro" que ela já havia dito que não teve situação para aplicar.

**Parte que é do usuário:** ela chegou com tolerância zero declarada, queria resposta imediata e conselho direto ("Que você me oriente sobre comunicação assertiva no trabalho"), e o formato de sessão guiada por perguntas não é isso. Isso não desculpa os itens 1–3, mas explica por que a fricção escalou tão rápido.

## O que será alterado — item por item

Tudo abaixo é em `supabase/functions/aura-agent/index.ts`, salvo onde indicado. Nenhuma mudança em cobrança, checkout, Woovi/Stripe ou landing.

### 1. Preferência de áudio deixa de ser "por turno" e passa a ser do perfil

**Como é hoje:** `userWantsAudio()` (linha ~3568) olha só a mensagem do turno atual. Se a pessoa pede áudio no turno 3, o turno 4 volta a texto. Nada é gravado.
Fora dos 2 áudios obrigatórios de abertura (`determineAudioMode()`, regra 2, linha ~1821), o áudio só sai se o modelo escrever a tag `[MODO_AUDIO]` — a preferência da usuária não tem força nenhuma.

**O que muda:**
- **Migração (nova coluna):** `profiles.voice_mode text default 'auto'` + `voice_mode_set_at timestamptz`. Valores `auto | audio | texto`.
- **Escrita:** quando o pedido for explícito ("fala por áudio", "responde em áudio"), grava `voice_mode='audio'` e a data. Pedido de texto grava `'texto'`.
- **Leitura:** em `determineAudioMode()`, nova regra após a checagem de crise: `voice_mode==='audio'` + budget disponível → `{ shouldUseAudio: true, reason: 'user_preference', mandatory: true }`. O `mandatory: true` é o que faz `splitIntoMessages()` gerar áudio sem depender da tag `[MODO_AUDIO]` do modelo.
- **Teto de orçamento intacto:** `budgetSeconds` (30/90/180 min por plano) continua mandando; a diferença é que ao estourar a Aura **avisa em uma frase** ("meu áudio do mês acabou, sigo por texto") em vez de voltar a texto em silêncio — foi esse silêncio que gerou 9 correções.
- **Quem não pede nada não muda:** `auto` mantém exatamente o comportamento atual.

**Sua dúvida 1 — quando a preferência expira?** Não pode ser eterna, senão um pedido feito numa sessão específica vira regra vitalícia. Três desligamentos, todos determinísticos (nada de LLM decidindo):
1. **Pedido contrário** — "responde por texto", "prefiro ler" → volta pra `texto` na hora.
2. **Expiração por tempo** — a preferência vale por **7 dias** desde `voice_mode_set_at`; passado isso volta pra `auto` sozinha. Se a pessoa pedir áudio de novo, renova por outros 7 dias. Quem quer áudio sempre acaba pedindo de novo naturalmente; quem pediu "só nessa conversa" não fica preso.
3. **Teto de áudio do plano** — enquanto o teto estiver estourado, cai pra texto com aviso, e volta a áudio no reset mensal (a preferência não é apagada).

A conversa terminar **não** desliga: seria voltar ao bug atual (a Elisabete pediu 4 vezes em 2 dias diferentes). O "fim" é por pedido contrário ou pelos 7 dias.


### 2. Passar a registrar o canal de cada mensagem (auditoria)

**Como é hoje:** `messages` tem 5 colunas (`id, user_id, role, content, created_at`). Não há como provar no banco se uma resposta saiu em áudio ou texto — só existe `sessions.audio_sent_count`, e ele só é incrementado na abertura de sessão (linha ~8580). Foi por isso que precisei reconstruir esse caso por dedução.

**O que muda:** migração adicionando `messages.is_audio boolean default false`, preenchido por `supabase/functions/process-webhook-message/index.ts` no ponto onde já persiste bolha por bolha (o objeto de bolha já carrega `isAudio`). Zero custo em runtime, e a auditoria de sessão passa a poder mostrar "resposta entregue em texto apesar do pedido de áudio".

### 3. Freio de interpretação para usuário que já corrigiu

**Como é hoje:** as 15 correções mais recentes de `user_memory_corrections` são carregadas no contexto (query 11, linha ~5661) como texto genérico de memória. Não há nenhuma regra que **proíba** o vocabulário que a pessoa acabou de recusar — foi assim que a Aura, depois de 8 correções sobre interpretação, ainda disse "sua fúria vira o foco" e "você virou a personificação do medo". O bloco `REGRA ANTI-INTERPRETAÇÃO PRECOCE` (linha ~8170) existe, mas está gated em `isNewUser && !sessionActive` — ou seja, não vale dentro de sessão, que é justamente onde o dano aconteceu.

**O que muda (só prompt + 1 condição):**
- Novo bloco injetado quando o usuário tiver **3 ou mais correções nos últimos 14 dias** — e válido também **dentro de sessão** (sem o `!sessionActive`):

  ```text
  # 🚫 MODO DESCRITIVO (usuário já corrigiu sua leitura N vezes)
  - Só use palavras que ELE usou. Não nomeie emoção, motivo ou padrão que ele não nomeou.
  - PROIBIDO afirmar estado interno: "sua fúria", "você grita", "você é a personificação de X",
    "você fundiu sua identidade", "você tá exausta", "no fundo você...".
  - Reframe apenas como hipótese verificável, e uma por sessão:
    "Posso te devolver uma leitura? ... faz sentido ou tô lendo errado?"
  - Se ele corrigir, aceite em uma frase e NÃO reformule a mesma tese com outras palavras.
  ```
- Reaproveita o padrão de injeção condicional que já existe no arquivo (`dynamicContext +=`), sem novo modelo, sem chamada extra de LLM, sem tabela nova.

**Sua dúvida 3 — a Aura vai parar de nomear emoção pra todo mundo?** Não. Esse bloco é **por usuário e temporário**, não é regra global:
- **Gate de entrada:** só entra com **≥3 correções de interpretação nos últimos 14 dias** do MESMO usuário. Hoje isso pega um punhado de casos, não a base.
- **Gate de saída:** passados 14 dias sem nova correção, o bloco sai sozinho e a Aura volta ao normal com aquela pessoa.
- **Filtro de tipo:** só conta correção classificada como interpretação/leitura (é o que a Elisabete acumulou), não correção factual de nome/horário.
- **O que ela ainda pode fazer no modo descritivo:** perguntar sobre emoção ("como isso te deixou?"), usar a palavra que o usuário usou, oferecer leitura **como hipótese aberta** com pedido de confirmação. O que fica proibido é **afirmar** estado interno que a pessoa não nomeou. Ou seja: nomear continua permitido, **impor** não.
- Para todos os outros usuários, o confronto cirúrgico e o reframe seguem exatamente como estão hoje.

### 4. Concordância passiva deixa de valer como aval para continuar impondo

**Sua dúvida 4 — o que aconteceu aqui, em concreto:** a Aura entregou a leitura "você virou a personificação do medo e não da técnica". A Elisabete respondeu curto ("Isso mesmo. Como?"). O extractor, que roda a cada turno e classifica o que aconteceu, marcou `user_validated_hypothesis: true` — pela regra atual (linha ~888: "true se o usuário concordou: 'é isso', 'faz sentido'"), qualquer "isso mesmo" conta como validação. Com essa flag ligada, a trava de hipótese "sticky" (linha ~1975) entende "a tese foi aceita, pode aprofundar" e libera a Aura a seguir empilhando a mesma leitura. Foi aí que veio a próxima interpretação, e a resposta dela: **"Vc está me julgado?"**. A auditoria da sessão nomeia isso como `concordancia_passiva_tratada_como_reflexao`.

Ou seja: um "isso mesmo" de polidez foi lido pelo sistema como permissão para insistir. É o mecanismo que transformou uma leitura desconfortável em três.

**O que muda:** endurecer a definição de `user_validated_hypothesis` no prompt do extractor. Passa a exigir elaboração própria — o usuário trazer conteúdo novo sobre a leitura. Explicitamente **não** valida: resposta de ≤4 palavras, resposta que é só uma pergunta de volta ("Como?", "E aí?"), ou concordância seca. Nesses casos a flag fica `false`, a hipótese continua "não confirmada", e a regra que já existe manda a Aura **checar antes de aprofundar** em vez de empilhar. É mudança de texto do extractor, sem lógica nova e sem afetar quem realmente concorda elaborando.

### 5. Rota "orientação prática" dentro da sessão

**Como é hoje:** quando o foco declarado da sessão é pedido de orientação ("que você me oriente sobre comunicação assertiva no trabalho"), o fluxo segue igual: perguntas encadeadas até o tempo acabar. Ela terminou com "não teve nada além do que eu já sabia" e a auditoria marcou as 4 camadas investigativas como não cobertas e a fase de movimento como falha.

**O que muda:** quando o foco da sessão for explicitamente pedido de orientação/técnica, entregar **2 a 3 movimentos concretos** e só depois investigar o que travaria a aplicação. Mesma quantidade de balões, uma pergunta por resposta.

**Sua dúvida 5 — não vira movimento cedo demais pra todos?** Esse é o risco real, e por isso a rota é estreita:
- **Não é o padrão.** Só dispara quando o **foco declarado da sessão** (o campo de foco, não uma frase qualquer no meio) é pedido de orientação/técnica. Sessão que abre com desabafo, dor ou situação em aberto não entra — segue Presença → Sentido → Movimento como hoje.
- **Não substitui a exploração, antecipa uma parte dela.** A entrega prática vem **depois** do relato concreto (a Aura ainda precisa saber o que aconteceu) e serve como material para investigar: "desses três, qual você não conseguiria fazer amanhã? Por quê?". O que travava a Elisabete é justamente isso — ela nunca chegou a ter algo pra reagir.
- **Não mexe no cardápio de fechamento** nem em `[ENCERRAR_SESSAO]`: o fechamento continua exigindo material da conversa.
- **É prompt, reversível em uma linha** — se a auditoria de sessões mostrar queda de nota nas sessões que entraram nessa rota, a gente remove o bloco. Sugiro medir pelas notas de `session_coverage_analyses` nas 2 semanas seguintes.

### 6. Cortar o ruído pós-sessão

**Sua dúvida 6 — o que aconteceu aqui:** dois ruídos diferentes, com causas diferentes.

**(a) A mensagem "E aí" às 13:20.** A sessão foi encerrada 13:03. O cron `conversation-followup` existe pra recuperar conversa **interrompida** (usuário parou de responder no meio). Ele checa se a pessoa ficou inativa, se há sessão ativa, DND, janela de 24h — mas **não checa se uma sessão acabou de ser encerrada**. Como logo depois do encerramento a pessoa está "inativa" por definição (a conversa terminou de propósito), o cron interpretou o silêncio normal do pós-sessão como abandono e disparou um nudge. O texto saiu genérico ("E aí") porque não havia contexto novo pra puxar. Para a Elisabete, que acabara de sair de uma sessão frustrante, isso chegou como cutucada sem propósito — 17 min depois, seguido às 13:40 do pedido de nota.
**Correção:** uma condição a mais na lista de skips que a função já tem — pular quando existir sessão encerrada nos últimos 60 minutos. Conversa realmente interrompida no meio continua sendo recuperada normalmente.

**(b) A cobrança do compromisso "Termômetro".** No fechamento da sessão de 15/08 a Aura deixou o compromisso "ser o Termômetro: relatar a falha de forma fria". Na sessão de 22/08 a Elisabete disse que **não houve situação** para aplicar. O compromisso ficou como pendente em `commitments`, e o lembrete voltou a cobrar como se ela tivesse fugido da tarefa — cobrando uma coisa que a realidade dela não ofereceu chance de fazer.
**Correção:** quando o usuário declarar que não houve situação para aplicar, marcar o compromisso como **não aplicável** (em vez de deixá-lo pendente), reusando o mecanismo de `cancel_topics` que já existe no post-análise. Assim ele sai da fila de cobrança sem virar "compromisso descumprido". Compromisso que a pessoa simplesmente não fez continua sendo retomado como hoje.


### O que NÃO será mexido

Áudio de crise e de abertura/fechamento de sessão; orçamento de áudio por plano; ciclo de vida de sessão (45 min, 4 fases); cardápio de fechamento; qualquer coisa de pagamento; qualquer landing ou checkout.

## Ação com a usuária

Resposta honesta assumindo os dois pontos (áudio ignorado e leitura imposta), sem justificativa, com escolha: reembolso do ciclo e cancelamento sem atrito, ou uma sessão de retorno já no formato que ela pediu (áudio + orientação prática). Recomendo oferecer o reembolso primeiro — ela pagou 7 dias e a experiência não cumpriu um combinado explícito.

## Resumo do tamanho da mudança

| Item | Tipo | Onde |
|---|---|---|
| `profiles.voice_mode` | migração (1 coluna) | banco |
| Gravar/ler preferência de áudio | código (~10 linhas) | `aura-agent` (`determineAudioMode`, ~1795) |
| Aviso de teto de áudio esgotado | texto do prompt | `aura-agent` |
| `messages.is_audio` | migração (1 coluna) + 1 linha | banco + `process-webhook-message` |
| Bloco MODO DESCRITIVO | texto + 1 condição | `aura-agent` (~8153) |
| Validação de hipótese mais rígida | texto do extractor | `aura-agent` |
| Rota orientação prática | texto do prompt | `aura-agent` |
| Skip de follow-up pós-sessão | código (1 condição) | `conversation-followup` |
| Compromisso não aplicável | código (reuso de `cancel_topics`) | `aura-agent` |

Nenhuma tabela nova, nenhum cron novo, nenhuma chamada extra de LLM, nenhum painel novo.

