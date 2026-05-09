## Diagnóstico — por que a Aura faz eco interpretativo

Depois de ler o `aura-agent/index.ts`, o eco interpretativo NÃO vem da falta de uma regra "anti-eco". Ele vem do fato de que o prompt **ensina, repete e premia** esse padrão como exemplo de excelência em vários lugares. O modelo imita o que vê marcado como ✅ CERTO.

Os indutores principais são templates literais reaparecendo 4x no prompt:

1. `SESSION_PHASE_INSTRUCTIONS.exploration_to_reframe` (linha 1029)
   `✅ CERTO: "Sabe o que eu percebo em tudo isso que você trouxe? [nomeie o padrão/insight]..."`

2. `FREE_PHASE_INSTRUCTIONS.presenca_to_sentido` (linha 1060)
   `✅ CERTO: "Sabe o que eu percebo por baixo disso? [observação]..."`

3. `evaluateTherapeuticPhase` — guidance injetado em sessão (linha 1223)
   `Use reframe: "Sabe o que eu percebo em tudo isso que você trouxe? [insight]"`

4. `evaluateTherapeuticPhase` — guidance de Modo Profundo (linha 1330)
   `Traga UMA observação profunda: "Sabe o que eu percebo? [nomeie o que está por baixo]"`

Reforçadores secundários:
- DNA da Aura (linha 2539): "Você é uma mentora que OBSERVA, PERCEBE e FALA" — promove leitura como identidade.
- "PROVOQUE COM PROFUNDIDADE" (2582-2589) e "Eu vou te falar o que eu tô enxergando aqui..." como frase de entrada modelo.
- Em sessão, o `CONFRONTO CIRÚRGICO OBRIGATÓRIO` (1034) mais o `VALIDA + ENTREGA` (2674) em conversa livre criam pressão para entregar leitura toda hora.

Conclusão: o prompt atual diz "não faça eco" em um lugar e mostra "faça eco assim" em quatro. O modelo escolhe o exemplo concreto.

## Princípio do plano

**Menos é mais.** Em vez de adicionar a "REGRA ANTI-ECO" (linhas 2402-2451 que entraram no patch revertido), retirar/diluir os trechos que ensinam o eco. Manter o prompt enxuto.

## Mudanças propostas (cirúrgicas)

### 1. Remover a "REGRA ANTI-ECO" inteira
Bloco 2402-2451 introduzido no patch anterior. Não volta. É contradição que o próprio prompt resolve sozinho quando os indutores forem retirados.

### 2. Substituir os 4 templates "Sabe o que eu percebo..."
Trocar o `✅ CERTO` literal por uma descrição de princípio, sem frase pronta para copiar:

- Linhas 1029, 1060, 1223, 1330 — em todos:
  - **Antes:** `✅ CERTO: "Sabe o que eu percebo em tudo isso..."`
  - **Depois:** `✅ CERTO: devolva UMA observação concreta e nova (padrão recorrente, contradição, consequência) com suas próprias palavras — sem fórmula de abertura fixa.`

Resultado: o evaluator continua dizendo "é hora de reframe", mas para de entregar o molde verbal.

### 3. Diluir o DNA "OBSERVA, PERCEBE e FALA"
Linha 2539: trocar para algo como "Você é uma mentora que escuta, reage e, quando há algo realmente novo, devolve."
Mantém autoridade clínica sem sugerir que toda resposta precisa ter leitura.

### 4. Cortar a "PROPORÇÃO 40/30/30" e voltar ao mínimo
Bloco 2541-2549 acrescentado no patch revertido. Substituir por uma única frase:
"Observação só entra quando entrega algo novo (padrão, contradição, reframe). Caso contrário, reaja, pergunte, ou conduza."

### 5. Revisar "PROVOQUE COM PROFUNDIDADE" (2582-2589)
Manter a essência (provocar quando o material justifica) mas remover as **frases de entrada modelo** ("Deixa eu te devolver uma coisa...", "Eu vou te falar o que eu tô enxergando aqui...") — são exatamente os tiques que viram eco.

### 6. Revisar "VALIDA + ENTREGA" (2674)
Reforçar que "entrega" inclui **crítica de ação concreta, micro-movimento ou silêncio intencional**, com nomeação clínica como ÚLTIMA opção, não primeira. Hoje o texto já diz isso — basta ajustar a ordem para que crítica de ação apareça antes de nomeação.

## O que NÃO mexer

- Lógica do `evaluateTherapeuticPhase` (thresholds, freios, transições) — só os textos de exemplo dentro dela.
- Confronto cirúrgico, sessões, áudio, segurança, agendamento, memórias.
- Nenhuma alteração em `mem://`.
- Frontend, V2, edge functions além do `aura-agent`.

## Critério de validação (antes de deploy)

1. Rodar `phase_thresholds_test.ts` — todos os asserts sobre confronto cirúrgico, presença mínima, posturas clínicas devem continuar passando. Os testes só checam presença de blocos estruturais (não dependem dos templates removidos), então devem passar sem ajuste.
2. Buscar no arquivo `rg "Sabe o que eu percebo"` — deve retornar **zero** ocorrências como template literal (pode aparecer em comentário explicativo, mas não como `✅ CERTO`).
3. Buscar `rg "REGRA ANTI-ECO"` — zero.
4. Amostragem manual: pegar 3-5 conversas reais recentes (incluindo a do Franklin via `chat_messages` por número/email se você puder me indicar) e simular mentalmente como a Aura responderia — checar se sumiu o "Sabe o que eu percebo..." automático.

## Deploy

Após sua aprovação, edição em uma única passada, depois:
- `supabase--test_edge_functions ["aura-agent"]` (rodar `phase_thresholds_test.ts`)
- `supabase--deploy_edge_functions ["aura-agent"]` (manual, por causa do drift conhecido)
- Checar `failed_message_log` nos 10 min seguintes

## Tamanho do diff esperado

- ~50 linhas removidas (REGRA ANTI-ECO + PROPORÇÃO 40/30/30)
- ~4 substituições de uma linha (templates "Sabe o que eu percebo")
- ~3 ajustes de frase (DNA, PROVOQUE, VALIDA+ENTREGA)

Total: prompt fica **menor** que o original, não maior. Esse é o ponto.

## Pergunta antes de implementar

Quer que eu inclua na mesma passada a remoção das **frases de entrada modelo** ("Deixa eu te devolver uma coisa...", "Eu vou te falar o que eu tô enxergando aqui..."), ou prefere preservá-las e só atacar os 4 templates principais nesta primeira rodada? A versão mais enxuta (remover tudo) é a mais coerente com "menos é mais", mas também é a mais agressiva.