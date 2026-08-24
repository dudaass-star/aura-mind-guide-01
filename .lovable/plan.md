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

## Detalhes técnicos

Tudo em `supabase/functions/aura-agent/index.ts` (+ 2 campos no schema do extrator):

1. **TTL do rótulo (`aura_phase`)**: expira com 60 min de inatividade ou troca de dia
   civil (BRT). Mesmo padrão de idade já usado em `user_emotional_state`. Aplicado na
   leitura do `lastUserContext`, antes do `evaluateTherapeuticPhase()`.
2. **Rota de descida sempre ativa**: remover a guarda da linha ~1726
   (`if (!lastUserContext?.aura_phase)`) que hoje impede o rebaixamento para `ping-pong`
   sempre que existe fase salva. Com histerese: 2 turnos leves consecutivos para descer,
   evitando oscilação.
3. **Fase medida no usuário**: reescrever a instrução `aura_phase` do extrator
   (linha ~874) para classificar a **carga/convite do turno do usuário**, não a resposta
   da assistente.
4. **Estado de tópico em espera**: 2 campos novos no JSON que o extrator já devolve por
   turno — `topic_parked` (bool) e `parked_turns` (int). Zero chamada extra de LLM.
   Alimentam a decisão desvio-vs-virada (retomar até 2 turnos; soltar a partir de 3).
5. **Empurrão automático de presença → sentido** (linha ~1738, `recentPairs >= 4`): passa
   a exigir material concreto na mesa, não só contagem de trocas.
6. **Sessão**: bloco de abertura passa a orientar "puxar o fio como pergunta de contexto";
   a descida em sessão é pausa de 1–2 turnos, sem alterar a fase do session lifecycle.
7. Atualizar `phase_thresholds_test.ts` para os novos limiares e adicionar casos de
   desvio/retomada.
