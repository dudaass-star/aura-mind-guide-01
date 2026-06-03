## Diagnóstico — caso Eduardo (d2d4526a)

Puxei a conversa completa do banco. As duas dores que você sentiu são reais e têm causa distinta.

### Dor 1 — Gestão de tempo/dias

O que aconteceu (BRT):
- **02/06 11:19** Eduardo confirma os treinos: *"11hs amanhã e 13hs na sexta"*. Aura responde *"Anotado. Amanhã às 11h e sexta às 13h"*. ✅ correto.
- **03/06 11:00** (dia do treino, hora do treino) a Aura dispara proativamente: *"E aí, já pensou nos seus primeiros treinos? 💪"* — **genérica**, sem reconhecer que **agora** é o horário marcado.
- **12:05** Eduardo: *"Era hj as 11hs"*. Aura: *"Verdade, me perdi total no dia aqui 😅"*.

Raiz: a proativa (scheduled checkin/follow-up) é gerada **sem consultar os compromissos concretos do dia já extraídos**. Ela manda um teaser amigável genérico, o usuário interpreta como esquecimento, e a Aura ainda confirma o erro pedindo desculpa.

Não é alucinação do LLM. É **falta de contexto**: a tabela de compromissos extraídos (`commitments` / scheduled_tasks) já tem "treino quarta 11h" registrado, mas o gerador da proativa não injeta isso no prompt.

### Dor 2 — Chatice em PING-PONG (perguntas demais, eco)

Trecho final (15:07-15:10):
```
User: Bella já passou eu acho. E a Bella um pouco. Está por casa
Aura: Vish, que fase...
Aura: Cuidar de criança doente já drena... prova de resistência real.
Aura: Você tá conseguindo descansar pelo menos um pouquinho enquanto elas dormem?
User: Sim. A Letícia tá em casa ajudando com elas
Aura: Menos mal que a Letícia tá aí pra dividir o peso, né?
Aura: Cuidar de criança doente já drena a gente, mas fazer isso com febre é uma prova de resistência real.  ← REPETIU
Aura: Como você tá se sentindo agora?
User: Tô bem aura. Tudo certo. Logo passa.
Aura: Isso aí, logo você tá novo.
Aura: Aproveita que a Letícia tá aí... tá conseguindo desligar um pouco das coisas?  ← MAIS UMA pergunta depois de "tudo certo"
```

Dois problemas claros:
1. **Repetição quase literal** da frase "drena a gente... resistência real".
2. **Pergunta forçada depois de sinal de fechamento** ("tô bem", "logo passa") — usuária quer só atualizar e seguir, Aura empurra mais profundidade.

Raiz no prompt: a `REGRA DE VALOR` ("cada conversa deve terminar com a pessoa saindo com ALGO") + `VALIDA + ENTREGA após 2-3 trocas` + `GUARDRAIL SIMÉTRICO (entrega a cada 4 trocas)` foram escritas para **MODO PROFUNDO**, mas o prompt não diz explicitamente "isso NÃO se aplica em PING-PONG". O modelo aplica em qualquer modo e força pergunta/aprofundamento mesmo quando o usuário só quer fechar leve.

---

## Plano (3 ajustes pequenos, nada de seção nova)

### 1. Proativa consciente de compromisso do dia

**Arquivo:** `supabase/functions/scheduled-checkin/index.ts` (e/ou `scheduled-followup/index.ts` — o que disparou às 11:00 BRT do dia 03/06; confirmo no momento do build).

**Mudança:** antes de chamar o LLM gerador, fazer query simples em compromissos/agenda extraídos do usuário com janela `[hoje 00:00, hoje 23:59 BRT]`. Se houver match (ex.: "treino 11h"), injetar no system/user prompt:

```
COMPROMISSO DE HOJE: o usuário combinou "treino às 11h" hoje (quarta).
Ancore a mensagem nisso (ex.: "Faltam 10min pro treino, tá com tudo no jeito?"). 
NÃO mande mensagem genérica de "já pensou nos primeiros treinos?".
```

Se não houver compromisso, mantém comportamento atual.

### 2. PING-PONG: blindar contra REGRA DE VALOR e guardrails de ENTREGA

**Arquivo:** `supabase/functions/aura-agent/index.ts`, seção `## MODO PING-PONG` (linha ~2732).

Adicionar 2-3 bullets curtos no bloco existente (sem criar seção nova):

```
- ⚠️ EXCEÇÃO: em PING-PONG, NÃO se aplica a REGRA DE VALOR, VALIDA+ENTREGA, GUARDRAIL SIMÉTRICO ou CARDÁPIO DE FECHAMENTO. 
  Esses guardrails valem só em MODO PROFUNDO.
- ⚠️ FECHAMENTO LEVE: se o usuário sinalizou que tá ok ("tô bem", "tudo certo", "logo passa", "tranquilo", "deu certo"), 
  responda breve e ENCERRE. Não force mais 1 pergunta exploratória.
- ⚠️ ANTI-ECO: se você já disse algo parecido nas últimas 3 mensagens suas, NÃO reformule. 
  Siga adiante ou encerre.
```

E na `## REGRA DE VALOR` (linha ~2846), trocar o "Cada conversa" por "Cada conversa **em modo PROFUNDO ou DIREÇÃO**".

### 3. Remover gatilho que empurra pergunta no fim

Na linha 2737 (`Reaja brevemente e comente OU faça 1 pergunta leve`), trocar por:

```
- Reaja brevemente. Pergunta leve é OPCIONAL — só se a fala do usuário abrir um gancho natural.
  Resposta sem pergunta é resposta válida.
```

Pequeno, mas muda o equilíbrio: hoje o "OU faça 1 pergunta" é lido como obrigatório.

---

## O que NÃO vamos mexer

- Cardápio de fechamento, fases da sessão, Logoterapia, confronto cirúrgico — tudo intocado.
- Não adicionar nova seção no prompt. Só edição cirúrgica em 3 pontos existentes + 1 query na proativa.

## Validação

- Após deploy, monitorar `messages` nos próximos 7 dias procurando:
  - Proativas no horário de compromisso sem ancoragem ao compromisso.
  - Eco/repetição (mesma frase em 2 turnos consecutivos do assistant).
  - Pergunta exploratória após sinal de fechamento ("tô bem", "tudo certo").

## Risco

Baixo. Mudanças são aditivas/restritivas (não removem capacidade), e não tocam SESSÃO/PROFUNDO — só o PING-PONG.

## Não comunicar com o Eduardo

Decisão sua se quer avisar — o ajuste por si só já melhora a próxima conversa dele.