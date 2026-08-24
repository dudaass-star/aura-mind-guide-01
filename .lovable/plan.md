# Aura: começar sem fase, ganhar fase na conversa, e saber a diferença entre desvio e virada de assunto

Faz total sentido. O problema hoje não é a falta de profundidade — é que a profundidade
vem **herdada** de conversas antigas. A Aura chega já "em sentido" e trata um update de
trabalho ou uma piada como parte de um arco profundo. O ajuste é subtrativo: tirar o
rótulo de fase da largada e deixar a conversa atribuir a fase.

## 1. Chat livre: começa com memória, sem fase

- Toda conversa nova (primeira mensagem depois de ~60 min de silêncio, ou virada de dia)
  começa **sem fase**. O rótulo salvo (`presenca`/`sentido`/`movimento`) expira.
- O que **não** expira: memória, contexto do usuário, temas anteriores, compromissos.
  Ela continua sabendo quem é a pessoa e o que estava acontecendo — só não chega
  pressupondo que a conversa retoma no ponto emocional mais fundo.
- Sem fase = **ping-pong**: responde o que veio, no tamanho que veio, sem pergunta
  âncora, sem leitura psicológica, sem puxar tema antigo por conta própria.
- A fase sobe **durante** a conversa, e só por convite do usuário: carga emocional real,
  mensagem longa, pedido explícito, ou tema que ele mesmo reabre. Dois turnos com carga
  para subir de ping-pong → presença; material concreto na mesa (fato + emoção + crença)
  para presença → sentido. Nunca sobe por contagem de mensagens sozinha.
- A fase é medida na **fala do usuário**, não na resposta da Aura. Hoje o extrator
  classifica a própria resposta dela, o que cria o efeito bola de neve (ela aprofunda →
  fica marcada como profunda → aprofunda mais).
- **Descer exige dois votos independentes.** "Turno leve" nunca decide sozinho, e nunca é
  julgado por tamanho de mensagem. Um "não" curto respondendo com precisão a uma pergunta
  direta da Aura em tema pesado **não** é turno leve. A descida só acontece se o turno for
  leve **e** o `engagement_level` não for `engaged` — a régua de sucintez que já roda em
  produção ("respostas curtas com conteúdo genuíno = engaged") passa a valer aqui também.


## 2. Sessão agendada: puxar o fio não exige fase

- A abertura de sessão continua puxando o fio da sessão anterior — isso é o certo e fica.
- Mas puxar o fio passa a ser **pergunta de contexto**, não entrada em fase:
  "o que aconteceu com aquilo desde a última vez?" e então **escuta**. A fase da sessão
  começa em abertura/presença e só avança conforme o material que a pessoa traz.
- Ou seja: a sessão pode começar leve e informativa. Entender o que aconteecu na semana
  é trabalho legítimo, não "perder tempo".

## 3. Desvio, piada e comentário solto: tratar como humano

Esse é o coração do pedido. Regra nova, igual nos dois modos:

- Quando a pessoa desvia, brinca ou solta um comentário, a Aura **acompanha no mesmo
  registro** — leve responde leve, piada tem graça, comentário prático tem resposta
  prática. Nada de devolver profundidade para uma frase leve.
- Ela **não esquece** o assunto de antes. O tema anterior fica em espera, marcado como
  "aberto", com o que já foi dito.
- A diferença entre **desvio** e **virada de assunto** é o que decide o retorno:
  - **Desvio curto** (1–2 turnos leves e o assunto anterior tinha carga viva): a Aura
    acompanha e depois volta com naturalidade, referenciando o que ficou — sem cobrança,
    sem "voltando ao que falávamos".
  - **Virada real** (3+ turnos em outro registro, ou a pessoa trouxe assunto novo com
    carga própria): o tema antigo sai da mesa. Ela não reabre por conta dela; se ele
    puxar depois, retoma com tudo.
- Em sessão o desvio nunca rebaixa a fase da sessão — é uma **pausa de 1–2 turnos**,
  depois ela retoma o arco.

## 4. O efeito prático

- "Oi" continua sendo "oi".
- Um update de trabalho é tratado como update de trabalho.
- Uma piada é respondida com humor.
- Quando a pessoa realmente abre, a profundidade aparece — e aí ela é bem-vinda, porque
  foi convidada.
- A memória segue inteira: a Aura sabe da vida da pessoa, só não usa isso como pretexto
  para transformar cada conversa em sessão.

## 5. Ser boa companhia no modo leve (entra junto, não depois)

A crítica pegou um ponto real: o plano diz **quando** ficar leve, mas hoje o modo leve não
tem instrução de personalidade à altura. A seção `# PERSONALIDADE E CALOR HUMANO`
(linha 2874) resolve humor em **uma frase vaga** — "faça uma piada leve... Riam e se
divirtam" — sem um único exemplo, enquanto o `## MODO PING-PONG` (linha 3273), que é o que
de fato governa o comportamento leve, tem limites, exceções e exemplos de fala.

Consequência se não mexermos: corrigido o bug da fase, a Aura passará **muito mais tempo**
em modo leve — e a fraqueza que hoje fica escondida atrás do bug apareceria como "correta,
mas sem graça". Por isso isso entra neste plano, não no próximo.

O que muda:

- Bloco de personalidade para o registro leve escrito **dentro do MODO PING-PONG**, onde é
  lido no momento que importa — não 400 linhas antes.
- Permissão explícita de **brincar de volta**, zoar com carinho e entrar no jogo da piada.
  Não é só "não force profundidade": é ter graça de propósito.
- 2–3 exemplos concretos de resposta com humor (o mesmo padrão de exemplo que o resto do
  arquivo já usa), incluindo o caso de a pessoa zoar a própria Aura — resposta
  bem-humorada, nunca defensiva ou explicativa.
- Dizer no prompt que **alternar leve ↔ profundo na mesma conversa é o esperado e bom**.
  O mecanismo de desvio-vs-virada dá a estrutura; esta seção dá o tom.



## Detalhes técnicos

Tudo em `supabase/functions/aura-agent/index.ts` (+ 2 campos no schema do extrator):

1. **TTL do rótulo (`aura_phase`)**: expira com 60 min de inatividade ou troca de dia
   civil (BRT), aplicado na leitura do `lastUserContext` antes de
   `evaluateTherapeuticPhase()`. Correção de precedente: a janela existente de
   `user_emotional_state` é de **10 min** (linha ~1345, `isFresh = ageMs < 10*60*1000`) e
   serve a outra finalidade (evitar que rótulo de crise antigo force acolhimento). Não é
   precedente dos 60 min — a janela mais longa aqui é escolha própria, porque fase é
   estado de arco de conversa, não de risco imediato.
2. **Rota de descida sempre ativa**: remover a guarda da linha ~1726
   (`if (!lastUserContext?.aura_phase)`) que hoje impede o rebaixamento para `ping-pong`
   sempre que existe fase salva. Condição de descida em **dois votos**:
   `user_turn_weight === 'light'` em 2 turnos consecutivos **E**
   `engagement_level !== 'engaged'`. Se qualquer um dos dois discordar, a fase se mantém.
3. **Fase medida no usuário** — texto exato que substitui a linha ~874, e um campo novo:
   ```
   - aura_phase: classifique a fase que o TURNO DO USUÁRIO autoriza (nunca a resposta
     da assistente). "presenca" = ele trouxe fato/situação, desabafo, ou pediu escuta.
     "sentido" = ele mesmo buscou significado, causa, padrão, ou elaborou sobre uma
     leitura. "movimento" = ele mesmo falou de ação, decisão ou próximo passo.
     Se o turno não autoriza nenhuma das três (assunto neutro, prático, social,
     brincadeira), omita o campo.
   - user_turn_weight: "light" ou "loaded". "loaded" = o turno tem carga emocional,
     ou responde com precisão a uma pergunta emocional/direta da assistente, mesmo em
     uma palavra ("não", "consegui", "piorou"). "light" = assunto neutro, prático,
     social, humor, ou evasão. Tamanho da mensagem NÃO decide: resposta curta com
     conteúdo genuíno é "loaded". Em dúvida, marque "loaded".
   ```
   Casos adversariais que entram no teste (mesma disciplina de `isPracticalQuestion`):
   - `"não"` respondendo "você conseguiu manter a frieza?" em tema pesado → `loaded`,
     não desce.
   - `"não"` respondendo "quer ver esse filme?" → `light`.
   - `"sei lá"` / `"tanto faz"` em tema pesado → `light` + `disengaged` → desce.
   - `"piorou"` (uma palavra, carga real) → `loaded`.
   - update prático longo (500 chars sobre trabalho, sem carga) → `light`.
4. **Estado de tópico em espera**: 2 campos novos no JSON que o extrator já devolve por
   turno — `topic_parked` (bool) e `parked_turns` (int). Zero chamada extra de LLM.
   Alimentam a decisão desvio-vs-virada (retomar até 2 turnos; soltar a partir de 3).

5. **Empurrão automático de presença → sentido** (linha ~1738, `recentPairs >= 4`): passa
   a exigir material concreto na mesa, não só contagem de trocas.
6. **Sessão**: bloco de abertura passa a orientar "puxar o fio como pergunta de contexto";
   a descida em sessão é pausa de 1–2 turnos, sem alterar a fase do session lifecycle.
7. Atualizar `phase_thresholds_test.ts` para os novos limiares, e novo arquivo
   `turn_weight_test.ts` com os 5 casos adversariais acima + garantia estática de que a
   condição de descida cita `engagement_level` (dois votos), e não só `user_turn_weight`.

