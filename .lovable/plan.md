## Diagnóstico — caso Débora (558194070448)

Investiguei a conversa e identifiquei **um caso concreto** que explica a sensação de "pergunta sem sentido":

**Linha do tempo (02/06):**
- 14:44 → Aura entrega proativamente a Pergunta da Semana via template WhatsApp: *"Se tua dignidade acordou, o que ela te impede de aceitar ou fazer, hoje?"*
- 14:45 → Débora responde: *"Como assim não entende"* (estranhou a pergunta isolada, sem o contexto da sessão anterior do dia 01/06 à noite)
- 14:45 → Aura responde: *"Eita, acho que eu que me enrolei na pergunta e ficou confuso, Débora... desculpa."* — e pivota pra falar de "feridas" (assunto da sessão da noite anterior), sem se referir à pergunta semanal.

**Raiz técnica:**

Em `process-webhook-message/index.ts` (linhas 783-813) a resposta da pergunta é **gravada** em `weekly_questions.response_text` para fins analíticos, mas o **texto da pergunta nunca é injetado no contexto do `aura-agent`**. O LLM recebe só o "Como assim não entende" e tenta adivinhar a que se refere — usa a última sessão como âncora e produz uma resposta desconexa.

Conclusão: não é "alucinação" da Aura. É **falta de contexto** quando a usuária responde fora da janela imediata de uma pergunta proativa (semanal, mensal, cápsula, insight).

---

## Plano

### 1. Injetar âncora da Pergunta da Semana no prompt do agente

Em `process-webhook-message/index.ts`, **antes** de invocar o `aura-agent`, se houver `weekly_questions` pendente (entregue nas últimas 3h e sem `responded_at`), montar uma nota de sistema curta e anexar ao payload enviado ao agente, ex.:

```
[CONTEXTO_PROATIVO]
Há ~Xmin você enviou a Pergunta da Semana: "<texto>"
A próxima mensagem da usuária é provavelmente uma resposta/reação a essa pergunta.
Se ela disser "não entendi", "como assim", etc → reconheça que foi a pergunta da semana e reformule com naturalidade.
```

Essa janela deve cobrir os 3 tipos proativos que já têm tabela: `weekly_questions`, `monthly_letters`, e `pending_insights` (efeito oráculo) — mas começamos só com a semanal pra escopo enxuto. Mensal e oráculo ficam pra um follow-up se o usuário pedir.

### 2. Reduzir abstração das próprias perguntas semanais

A pergunta da Débora ("Se tua dignidade acordou...") é gerada por LLM no `send-weekly-question` com tool calling. Vou revisar o system prompt dessa função para exigir:
- linguagem concreta (não metafórica)
- ancorar em **um fato observável** da semana da usuária (não em conceito abstrato como "dignidade")
- evitar pressupostos não confirmados (ex.: "se sua dignidade acordou" assume que isso aconteceu)

### 3. Validação

- Buscar nos últimos 30 dias outros casos `weekly_questions` cuja `response_text` contenha *"não entendi"*, *"como assim"*, *"o quê"*, *"hein"*, *"que pergunta"* — para medir frequência real do problema.
- Após deploy, monitorar `failed_message_log` e amostrar 5 respostas para confirmar que a Aura passou a reconhecer o contexto.

---

## Detalhes técnicos

- **Arquivos editados:** `supabase/functions/process-webhook-message/index.ts` (montar contexto + passar pro agent), `supabase/functions/aura-agent/index.ts` (aceitar e renderizar o bloco `[CONTEXTO_PROATIVO]` no system message), `supabase/functions/send-weekly-question/index.ts` (refinar prompt do extractor).
- **Sem migrations** — usamos tabelas existentes.
- **Deploy:** lembrar do drift conhecido (memória `aura-agent-deployment-and-fallback-safety`) — usar `supabase--deploy_edge_functions(["aura-agent","process-webhook-message","send-weekly-question"])` manualmente.
- **Risco:** baixo. A injeção é aditiva (só adiciona contexto quando há pergunta pendente). Se a query falhar, envolvemos em try/catch fire-and-forget.

## Não faz parte deste plano

- Mudar como a Pergunta é entregue (continua como template proativo). 
- Mexer em monthly_letters / pending_insights (fica pra iteração futura se a Débora reportar de novo).
- Avisar a Débora — a decisão de comunicar com ela é sua.