# Marcinha: o agente respondeu — mas 9h depois e sem responder o que ela perguntou

## O que aconteceu de fato (dados da conversa)

| Hora (BRT) | Quem | Mensagem |
| --- | --- | --- |
| 04/09 22:05 | nós | Template "copiou PIX" — "o código travou no banco?" |
| 04/09 22:36 | Marcinha | "Não entendi direito o que é" |
| 04/09 22:36 | Marcinha | "Terapia ???" |
| 04/09 22:37 | Marcinha | "Ficou uma dúvida" (clique no botão) |
| 05/09 08:05 | agente | "Claro, Marcinha — qual ficou?" |

Duas coisas erradas, as duas são regra nossa:

1. **Silêncio de 9h28.** Ela escreveu às 22h36, dentro do horário silencioso (22h–08h). A regra atual guarda a mensagem e só responde na abertura do dia. Mas ela não estava dormindo: estava com o código do PIX na mão, no banco, naquele minuto. Perdemos a compra ali.
2. **A resposta ignorou a pergunta.** Ela já tinha dito qual era a dúvida ("não entendi direito o que é", "isso é terapia?"). Só que a regra de "dúvida em branco" olha apenas a última mensagem — o clique no botão — e proíbe o agente de responder qualquer coisa além de "qual ficou?". Resultado: ela explicou, e a gente perguntou de novo. Parece robô e queima a única resposta que tínhamos.

Detalhe agravante: as três mensagens dela geraram três enfileiramentos, e a abertura do dia só reprocessou a **última** — as duas perguntas de verdade foram descartadas.

## O que muda

### 1. Quem está no meio do pagamento é respondido na hora
O horário silencioso deixa de valer quando o lead **acabou de escrever pra nós** (ele iniciou o contato) e o assunto é a compra em andamento — código do PIX copiado, dúvida, erro no banco. A regra continua valendo para mensagens nossas de iniciativa própria (campanhas, lembretes): essas seguem esperando as 08h. Ninguém é acordado pela Aura; quem está acordado falando com ela é atendido.

### 2. A dúvida em branco passa a olhar a conversa toda, não só o último clique
- Se, nas mensagens ainda não respondidas, o lead já disse qual era a dúvida, o agente **responde a dúvida** — o clique no botão não apaga o que ela escreveu.
- "Qual ficou?" só sai quando realmente não há nada dito além do clique.
- A abertura do dia (e qualquer resposta) passa a considerar **todas** as mensagens do lead desde a nossa última resposta, não apenas a última.

### 3. "Isso é terapia?" ganha resposta pronta
A pergunta mais comum de quem chega pelo checkout ("não entendi o que é", "é terapia?") passa a ter um item de base de conhecimento com a resposta honesta e curta: não é terapia nem substitui, é uma companhia diária no WhatsApp com encontros guiados. Hoje o agente improvisa isso.

## Detalhes técnicos

- `supabase/functions/recovery-agent/index.ts`
  - Guard de quiet hours (linhas ~358-367): passa a só enfileirar quando o inbound **não** for reativo. Critério de "reativo": existe outbound nosso nas últimas 24h **ou** `checkout.pix_copied_at` recente. Caso reativo → segue o fluxo normal e responde na hora.
  - Enfileiramento: `pending_inbound` deixa de ser sobrescrito pelo último texto — concatena os inbounds pendentes (limite de 1000 chars, mais recentes primeiro).
  - `blankDoubt`: passa a ser calculado sobre o **conjunto** de inbounds desde o último outbound (consulta já existente de `recovery_messages`), não sobre `text`. Só é `true` se todos eles baterem em `isBlankDoubt`.
  - Turno enviado ao modelo: agrupa os inbounds não respondidos em um único bloco, para o modelo ver "não entendi o que é / é terapia? / ficou uma dúvida" junto.
- `recovery_knowledge_base`: INSERT de um item categoria `como_funciona` ("é terapia?" / "não entendi o que é").
- Deploy de `recovery-agent`. Sem mudança de schema, sem tocar em templates proativos, taster, dunning ou nas travas anti-PIX-não-pedido.

## Fora do escopo
Régua de templates proativos, cap de 30 dias, taster e dunning continuam como estão.
