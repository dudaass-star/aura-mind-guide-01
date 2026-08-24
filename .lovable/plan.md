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

### 1. Preferência de áudio — **a revisão está certa e meu diagnóstico anterior estava errado**

Fui checar a alegação linha a linha e ela se sustenta. `splitIntoMessages()`, linha 4081:

```
const isAudioMode = audioDecision.mandatory
  || audioDecision.reason === 'user_requested'   // <- já existe
  || (wantsAudioByTag && audioDecision.shouldUseAudio);
```

O bypass para pedido explícito **já existia** e o comentário do próprio código (linhas 4077-4080) documenta isso. Ou seja: **`mandatory: false` na regra 4 não era a causa.** Retiro esse ponto. Mudar `mandatory` ali sozinho não resolveria nada — e é exatamente o tipo de "correção" que dá sensação de progresso sem mover o sintoma.

**Investiguei o "por que o áudio falhava" antes de qualquer correção — e o resultado derruba também a hipótese de falha de TTS.**

Evidência dura (`storage.objects`, bucket `aura-tts-audios`, pasta dela): **19 arquivos de áudio foram gerados de fato** na janela da sessão de 22/08 — 15 entre 15h-16h UTC e 4 entre 16h-17h UTC (12h-14h BRT; a sessão foi encerrada 13:40 BRT). Ou seja: **o TTS funcionou, gerou e subiu os MP3.** A hipótese "generateTTS falhava" está descartada com prova material.

Os logs de console (Deno) da janela do incidente **não existem mais** — a retenção efetiva de `function_logs` neste projeto é de ~1 hora (verifiquei: o registro mais antigo consultável é de minutos atrás). E `token_usage_logs` está grande o suficiente para estourar timeout em qualquer agregação. Isso, por si só, é um achado: **não temos rastro de entrega de áudio**, e é por isso que estamos deduzindo em vez de ler.

**Com o TTS descartado, sobram três caminhos possíveis — e o próximo passo é distinguir entre eles, não corrigir no escuro:**

1. **Falha no envio ao provedor** (`sendAudioUrl`, `process-webhook-message` 1357-1381): o áudio existe no storage, mas o WhatsApp pode ter recusado o download da signed URL (bucket privado) ou o envio pode ter dado erro. Nesse caso o código cai pra texto com **só um `console.log`** — nada em `failed_message_log` (o `logFailedMessage` só roda no caminho de texto, linha 1395). Compatível com "zero registros dela" no log de falhas.
2. **Cápsula do Tempo** (item 7): nos turnos em que ela mandou áudio, o turno nem chegou na Aura — não houve TTS nem envio.
3. **Preferência não sobrevive ao turno** (`wantsAudio` recalculado da mensagem atual, linha 8187): turnos seguintes caem em `default_text`. Explica "ela esquece o combinado", não a promessa quebrada.

**Como fechar o veredito (primeiro passo da execução, antes de qualquer fix):** comparar, para a janela de 22/08, os 19 arquivos do storage com as mensagens `assistant` gravadas (`messages`) e os SIDs de saída do provedor. Se houver arquivo gerado sem entrega correspondente, a causa é o caminho 1 (envio) e o fix é instrumentar + tratar o erro de envio. Se os 19 áudios foram entregues, a queixa dela é dos turnos do caminho 2/3, e o item 1 vira só persistência de preferência — sem mexer em TTS. Não vou escolher o fix antes dessa comparação.


**O que muda (revisado):**
- **Instrumentar e não mentir no ponto real (linhas 1352-1382):** quando TTS ou envio de áudio falharem, gravar em `failed_message_log` (`error: tts_failed` / `audio_send_failed`) **e** marcar o turno como "áudio indisponível" para o usuário. Sem isso, continuamos sem enxergar a falha — foi por isso que precisei reconstruir o caso por dedução.
- **Trava de honestidade movida de lugar:** o sinal `audio_unavailable` no contexto do prompt passa a ser alimentado por **falha real recente** (última tentativa de TTS falhou ou teto estourado), não por suposição. A Aura só promete áudio quando o canal está saudável.
- **Persistência de preferência:** `profiles.voice_mode` (`auto|audio|texto`) + `voice_mode_set_at`, lido em `determineAudioMode()`. Isso resolve o caminho 3.
- **Ordem da regra 4:** subir o pedido explícito para depois da crise continua valendo — não porque quebrava áudio, mas porque hoje um pedido de texto/áudio pode ser mascarado por `session_opening`. É ajuste fino, não correção de bug. **`mandatory: true` fica fora do plano.**
- **Investigação obrigatória antes do fix:** ler os logs de `generateTTS` da função nas janelas 15/08 e 22/08 para saber **por que** falhava (quota do provedor de voz? texto longo? timeout?). Se for quota/limite, o fix é diferente do fix de timeout — não vou escolher no escuro.
- **Reconciliar `audio_mirror_enabled`:** confirmado no bloco da linha ~8218 — força áudio só quando a mensagem recebida é áudio. Passa a ser um dos gatilhos que escrevem `voice_mode`, com decisão final única em `determineAudioMode`. Comportamento do piloto inalterado.
- **Teto de orçamento e tier base:** intactos.

**Quando a preferência expira:** pedido contrário ("responde por texto") desliga na hora; expira sozinha em **7 dias**; teto do plano estourado derruba pra texto com aviso (a preferência não é apagada). Fim de conversa não desliga.




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
  - PROIBIDO espelhar/comparar com a vida real dele ("isso é igual ao que você faz com...",
    "assim como no trabalho...") sem que ELE tenha puxado a comparação.
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

**(b) A cobrança do "Termômetro" — e o bug maior que sua revisão achou.** Confirmei no banco agora: **18 compromissos** para essa usuária em 2 sessões, **nenhum concluído**. O "Termômetro" aparece **8 vezes** com redações diferentes. Pior, tem lixo de extração: a frase sarcástica dela virou 4 compromissos ("ser menos enrolada", "não ficar mandando mensagem de texto", "gravar aí no seu HD ou sei lá o que", "nossa conversa precisa ser por áudio"), inclusive **dois atribuídos à Aura** — "AURA vai gravar áudios para as conversas." e "AURA vai ser menos enrolada na próxima sessão." — guardados como compromisso **dela**. E duas perguntas da própria Aura ("Entregou o relatório? A responsabilidade agora é da gerência, não sua.") também viraram título.

**Causa raiz (verificada no código):** existem **dois gravadores independentes** de compromisso — o micro-agent (linha ~1903) e o `postConversationAnalysis` (linha ~2285) — e ambos usam o mesmo dedupe frágil: `ILIKE '%' || primeiros 40 chars || '%'`. Duas consequências:
- **Reformulação escapa.** "ser o Termômetro na segunda: relatar..." e "Na próxima segunda, agir como o Termômetro: relatar..." não casam nos 40 primeiros chars → viram registros separados. Foi assim que um compromisso virou 8.
- **Race entre os dois gravadores.** Os pares 16:05:14/16:05:18 e 16:40:14/16:40:18 são exatamente isso: cada um leu antes do outro gravar.
- **Nenhum filtro de autoria/validade.** Não há checagem de "isso é compromisso do usuário?" — qualquer string que o extractor devolver entra, inclusive fala da Aura e sarcasmo.

**Correção na raiz (seu pedido 2), não só no sintoma:**
1. **Um único gravador.** Compromisso passa a ser gravado só no `postConversationAnalysis`; o bloco do micro-agent para de inserir (mata a race).
2. **Dedupe semântico simples e determinístico:** normalizar (minúsculas, sem acento/pontuação/stopwords), extrair as palavras-chave e comparar com os pendentes do usuário nos últimos 30 dias — sobreposição alta = mesmo compromisso, faz `update` em vez de `insert`. Sem LLM, sem embedding.
3. **Filtro de autoria no extractor:** só entra compromisso do **usuário**, na primeira pessoa, com ação concreta. Descartado explicitamente: título que começa com "AURA", fala/pergunta da assistente, e frase de tom sarcástico/reclamação sobre a Aura.
4. **Teto por sessão:** no máximo **1 compromisso ativo por sessão** (o cardápio de fechamento já prevê um por fechamento). Extra vira `update` do existente.
5. **Não aplicável:** quando o usuário disser que não houve situação para aplicar, marcar como **não aplicável** (reuso de `cancel_topics`), saindo da fila de cobrança sem virar "descumprido".
6. **Limpeza pontual:** consolidar os 18 registros dela em 1 (script de dados, só para esse usuário — não faço limpeza em massa sem você aprovar).

### 7. Veredito do bug das mensagens estranhas: **não é duplicação, é a Cápsula do Tempo engolindo os áudios dela**

Investiguei agora no código e o caso fecha. As duas frases não são resposta de sessão da Aura — são **mensagens fixas do fluxo da Cápsula do Tempo**, em `process-webhook-message`:

- linha 901: `"Recebi seu áudio! 🎙️ Ficou do jeito que você queria?..."` — estado `awaiting_audio`
- linha 947: `"Troquei o áudio! 🎙️ Esse ficou bom? Me diz 'pode guardar'..."` — estado `awaiting_confirmation`

**O mecanismo (verificado linha a linha):**
1. Em algum momento a Aura ofereceu a Cápsula do Tempo e gravou `profiles.awaiting_time_capsule = 'awaiting_audio'` (`aura-agent`, linhas 1959 e 8334).
2. A partir daí, o handler da cápsula roda **antes** de chamar a Aura (linha 889) e **retorna cedo** (`releaseLock()` + `return`) em todos os caminhos.
3. Ou seja: **todo áudio que ela mandou não chegou na Aura.** Foi consumido pela cápsula, que respondeu "Troquei o áudio!" e encerrou o processamento. 4 áudios em 25 s = 4 vezes a mesma frase. Não é retry, não é lock, não é reentrega do provedor — é 1 resposta por áudio, funcionando "como programado".
4. **O estado praticamente não expira — e a revisão está certa ao me corrigir aqui.** Existe sim um timeout de 24 h (linhas 1015-1023), mas ele tem dois defeitos: usa `profile.updated_at`, um campo que **qualquer** escrita no perfil reseta (inclusive sem relação com a cápsula); e, pior, ele está **abaixo dos `return` dos estados `awaiting_audio`/`awaiting_confirmation`** — então para os dois estados que realmente prendem o usuário esse bloco é **código morto**. Não é "nunca expira" por ausência de regra: é uma regra que nunca é alcançada.
5. **Assimetria confirmada:** no caminho de **texto** existe uma saída ("resposta não reconhecida" → limpa o estado e segue o fluxo normal, linhas 1009-1011). No caminho de **áudio** não existe saída nenhuma. Ou seja, quem responde por áudio fica preso indefinidamente — exatamente o perfil dela.

**Sobre a hipótese de reentrega de webhook (levantada na revisão): descartada por verificação.** Os três webhooks de entrada deduplicam por ID do provedor via `zapi_message_dedup` antes de acionar o worker — `webhook-meta` (linhas 189-199), `webhook-twilio` (linhas 121-133) e `webhook-zapi`. Reentrega do mesmo `wamid`/`MessageSid` é rejeitada. Então 4 respostas em 25 s correspondem a **4 áudios distintos dela** (áudios curtos de ~5 s, consistente com alguém irritado repetindo o pedido), não a evento duplicado. Não há item de idempotência a abrir.

**Isso reescreve o item 1 do caso.** A queixa "pedi pra falar por áudio e ela me responde em texto" tem **duas causas somadas**:
- **(a)** pedido por **texto** chegou na Aura, `isAudioMode` provavelmente ficou `true`, e o áudio morreu na falha silenciosa de TTS/envio (item 1, caminho 1);
- **(b)** pedido por **áudio** nem chegou na Aura — a cápsula respondeu "Troquei o áudio!" e o turno terminou ali.

O `"Ih, que"` truncado segue como checagem de 1 query no início da implementação (banco indisponível agora, pool esgotado).


**Correções (todas em `process-webhook-message`, escopo pequeno):**
1. **Expiração do estado:** cápsula vale **1 hora** desde que foi oferecida. Passado isso, o estado é limpo e a mensagem segue o fluxo normal para a Aura. (Precisa de 1 coluna: `capsule_state_set_at`, ou reusar timestamp existente.)
2. **Saída por intenção, não só por palavra-chave:** se a mensagem (áudio ou texto) não tem nada a ver com gravar cápsula — como "quero que você me responda por áudio" — cair fora do estado e entregar para a Aura, em vez de responder "Troquei o áudio!".
3. **Teto de repetição:** a mesma frase da cápsula não sai mais de **2 vezes** seguidas; na terceira, o sistema abandona o estado e passa a bola pra Aura ("deixa a cápsula pra depois").
4. **Não silenciar pedido de canal:** pedido explícito de áudio/texto passa a ser detectado **antes** do bloco da cápsula, gravando `voice_mode` (item 1) mesmo quando o handler da cápsula for encerrar o turno.

**Prioridade:** P0, junto com o item 1 — são o mesmo sintoma vivido por ela.

### 8 e 9 — descartados por enquanto

Latência e cobertura de auditoria de sessões saem deste plano, a seu pedido.


### O que NÃO será mexido

Áudio de crise e de abertura/fechamento de sessão; orçamento de áudio por plano; ciclo de vida de sessão (45 min, 4 fases); cardápio de fechamento; qualquer coisa de pagamento; qualquer landing ou checkout.

## Ação com a usuária

Resposta honesta assumindo o que foi nosso — e agora sabemos que foi mais grave: não foi "não atendemos o pedido de áudio", foi **prometer três vezes e não cumprir por bug nosso**. Sem justificativa técnica pra ela; escolha entre reembolso do ciclo com cancelamento sem atrito, ou sessão de retorno já no formato que ela pediu. Recomendo oferecer o reembolso primeiro.

## Ordem de execução — separada por risco para o modelo (Flash)

A revisão trouxe o critério certo: o risco de "o modelo se perder" só existe nos itens que adicionam texto ao prompt. Adoto essa divisão.

**Grupo A — só backend, o modelo nem sabe que existe (risco zero de sobrecarga de instrução):**
1. **P0** — item 1 revisado: instrumentar a falha silenciosa de TTS/envio (`process-webhook-message` 1352-1382) + investigar os logs de `generateTTS` antes de escolher o fix; `profiles.voice_mode`; reconciliar `audio_mirror_enabled`.
2. **P0** — item 7: expiração real da cápsula (timestamp próprio, e o bloco **movido para antes** dos `return` dos estados, senão continua morto), saída por intenção, teto de repetição, saída também no caminho de áudio.
3. **P0** — item 6b: gravador único de compromissos + dedupe + filtro de autoria.
4. **P1** — item 2 (`messages.is_audio`) e item 6a (skip de follow-up pós-sessão).

**Grupo B — adiciona prompt condicional (entra em série, um por vez):**
5. **P1** — item 3 (MODO DESCRITIVO) sozinho. Antes de subir: testar contra a conversa real da Elisabete reescrita, mais de uma passada, para ver se o Flash obedece de forma consistente. Depois: medir 1-2 semanas em `user_memory_corrections`.
6. **P2** — item 5 (rota de orientação prática) só **depois** dessa medição, e só se o item 3 não tiver degradado nada. Se o Flash já estiver no limite de atenção, este item é descartado — não vale o risco.

Item 4 (validação de hipótese) fica no Grupo A: é texto do extractor, agente separado e estreito, não compete com o prompt principal.

## Resumo do tamanho da mudança

| Item | Tipo | Onde |
|---|---|---|
| Instrumentar falha de TTS/envio de áudio | código (~10 linhas) | `process-webhook-message` (1352-1382) |
| Trava de honestidade de canal (por falha real) | código + prompt | `aura-agent` |
| `profiles.voice_mode` + `voice_mode_set_at` | migração (2 colunas) | banco |
| Reconciliar `audio_mirror_enabled` | código (move override) | `aura-agent` |

| `profiles.voice_mode` + `voice_mode_set_at` | migração (2 colunas) | banco |
| Reconciliar `audio_mirror_enabled` | código (move override) | `aura-agent` |
| Cápsula: expiração + saída por intenção + teto | código (~30 linhas) + 1 coluna | `process-webhook-message` (~889-1021) |
| `messages.is_audio` | migração (1 coluna) + 1 linha | banco + `process-webhook-message` |
| Bloco MODO DESCRITIVO | prompt + 1 condição | `aura-agent` |
| Validação de hipótese mais rígida | texto do extractor | `aura-agent` |
| Rota orientação prática | prompt | `aura-agent` |
| Skip de follow-up pós-sessão | código (1 condição) | `conversation-followup` |
| Compromissos: gravador único + dedupe + autoria | código (~40 linhas) | `aura-agent` |
| Consolidar os 18 compromissos dela | script de dados | banco |

Nenhuma tabela nova, nenhum cron novo, nenhuma chamada extra de LLM no caminho quente.



