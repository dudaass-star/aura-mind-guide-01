## Contexto

Diagnóstico confirmado no `supabase/functions/aura-agent/index.ts`: o prompt está estruturalmente viciado em **micro-passo** (L1043, L1080, L1418, L2697, L2733-2734). Isso subentrega em encruzilhadas existenciais — terreno central da Logoterapia. Resultado: sessões que poderiam fechar com direção forte fecham com "passo pequeno demais pra ser recusado", e o usuário não percebe valor de elite.

## Princípio guia

**Cardápio de fechamento, escolhido pela clínica da sessão — não por rotação.** Direção forte (tese/encruzilhada/leitura) vira padrão; micro-passo continua válido como exceção quando a sessão pediu (paralisia operacional, somatização, gap longo até a próxima). A Aura entrega como **hipótese aberta**, não como verdade.

## Escopo (1 arquivo de código + 2 de memória)

### 1. `supabase/functions/aura-agent/index.ts` — prompt da Aura

**1.1 Novo bloco "CARDÁPIO DE FECHAMENTO"** na fase Movimento, com **árvore de decisão** (não lista solta):

```
ESCOLHA POR ORDEM — primeiro critério que bater, decide:

1º Usuário pediu direção literal ("me ajuda", "o que faço")?  → TESE ou ENCRUZILHADA
2º Há 2 forças em tensão clara sem caminho óbvio?              → ENCRUZILHADA NOMEADA
3º Padrão repetido que ele ainda não vê?                       → LEITURA CRÍTICA ou EXPERIMENTO DE OBSERVAÇÃO
4º Insight emergente recém-nascido que precisa decantar?       → PERGUNTA PRA CARREGAR
5º Ambivalência paralisante entre duas opções concretas?       → ESCOLHA BINÁRIA A TESTAR
6º Paralisia operacional / somatização / gap > 14d?            → MICRO-PASSO
7º Nenhum acima?                                               → TESE como hipótese aberta (default)
```

Cada formato com **1 exemplo curto** em PT-BR informal.

**1.2 Regra "um formato por fechamento"** (explícita):
> *"Escolha UM. Não combine. Misturar formatos dilui a entrega e devolve o vício socrático por outra porta."*

**1.3 Regra anti-rotação:**
> *"O cardápio é descritivo, não prescritivo. Repetir o mesmo formato 3 sessões seguidas é correto se a clínica pediu. Rotacionar por rotacionar é pior do que o vício de micro-passo."*

**1.4 Regra "entrega como hipótese"** (substitui qualquer tom de "verdade"):
> *"Você entrega hipótese, não verdade. Formato: 'O que tô vendo daqui é [X]. Faz sentido pra você ou tô errando o ângulo?' A força não tá em estar certa — tá em arriscar uma leitura e dar espaço pra o usuário refinar ou recusar. Se ele recusar, isso É o trabalho — não é falha."*

**1.5 Reescrita das regras enviesadas para micro-passo:**
- L1043, L1080, L1418 ("menor passo em direção a isso") → reescrever apontando pra árvore do cardápio, sem privilégio de micro-passo.
- L2697 (VALIDA + ENTREGA): nova ordem de preferência ancorada na árvore.
- L2733-2734 ("passo pequeno demais pra ser recusado") → restringir ao caso 6 (paralisia operacional).

**1.6 Detector de pedido de direção** (no Phase Evaluator, embutido nas instruções táticas existentes). Quando aparecer "me ajuda", "o que faço", "tô perdido", "não sei pra onde ir" nos últimos 10min da sessão: injetar diretiva *"NÃO devolva pergunta socrática. Entregue TESE ou ENCRUZILHADA como hipótese aberta — sem opção."* Isso reduz a decisão livre da Aura nos casos mais óbvios e blinda o risco de "se perder no cardápio".

**1.7 Guardrail simétrico ao "uma pergunta por turno":**
> *"Após Presença consolidada, a cada 4 trocas, no mínimo 1 mensagem da Aura deve ser entrega (hipótese, observação, confronto, leitura) — não pergunta exploratória."*

**1.8 Reforço da abertura da próxima sessão** (fase opening, bloco "ABERTURA OBRIGATÓRIA COM FIO CONDUTOR" já existente). Adicionar regra: ler `session_summary` + `key_insights` da sessão anterior (já no contexto) e abrir retomando o eixo concretamente — não "como você tá hoje?". Exemplo: *"Na última a gente fechou com [eixo]. O que isso mexeu/produziu/mostrou na semana?"*

Isso resolve o carry-over **sem schema novo, sem migration, sem mexer no extractor.**

### 2. Memória do projeto

- Atualizar `mem://persona/logotherapy-methodology-depth` — refletir cardápio de fechamento como evolução das 3 fases (Movimento agora tem 7 formas de aterrissar, escolhidas por árvore).
- Criar `mem://features/sessions/closure-cardapio` — documentar a árvore, regra "um formato por fechamento", regra anti-rotação, regra "hipótese não verdade", e que micro-passo é exceção clínica.

## Fora de escopo (descartado conscientemente)

- ❌ **Migration** (`commitment_type`, `session_direction`, índice) — observabilidade, não UX. Usuário não sente a diferença entre commitment tipado e não tipado.
- ❌ **`session-extractor`** (schema, prompt, persistência tipada) — mesma razão. `session_summary` + `key_insights` já cobrem o carry-over.
- ❌ Bloqueio de fechamento vazio via `aura_phase` — embutido no guardrail dos 4 turnos.
- ❌ Mexer em rating, scheduling, D0, meditação, áudio, UI admin/portal.

## Por que isso não vai sobrecarregar o Gemini 2.5 Pro

- Árvore de decisão (primeiro critério bate, decide) é muito mais robusta pra LLM do que cardápio livre.
- Detector de pedido de direção remove escolha nos casos mais perigosos (justamente onde o caso Jeferson falhou).
- Regra "um formato por fechamento" elimina o pior modo de falha (misturar tudo).
- 7 itens com 1 exemplo cada é leve comparado ao tamanho do prompt atual.

## Validação

1. **Caso Jeferson em retest simulado** (via conversa nova ou `aura-tests`): ao chegar em "me ajuda, o que faço?" depois de explorar trauma do bullying + "poste", a Aura deve disparar o detector e entregar TESE ou ENCRUZILHADA como hipótese aberta — não devolver pergunta socrática nem propor "pegar um livro hoje". Conferir nos logs do `aura-agent` que a diretiva foi injetada.
2. **Sessão exploratória curta** (≤4 pares): guardrail dos 4 turnos NÃO deve disparar antes de Presença consolidada (mantém `recentPairs >= 4`).
3. **Próxima sessão de user com histórico**: primeira mensagem da Aura retoma o eixo da anterior usando `session_summary` — não pergunta genérica.
4. **Sessão com paralisia operacional clara** ("não consigo nem abrir o caderno"): Aura ainda escolhe MICRO-PASSO (caso 6 da árvore). Cardápio não pode virar viés anti-micro.
5. **Usuário recusa a hipótese** ("não, não é isso"): Aura aceita, refina, segue — não insiste. Recusa é trabalho, não falha.
6. **Mistura de formatos**: conferir em 3 sessões consecutivas que cada fechamento entrega UM formato claro — não combinação.

## Sequência de execução

1. Editar prompt do `aura-agent/index.ts` (1 arquivo, ~8 blocos de mudança).
2. Atualizar/criar as 2 memórias.
3. Validação manual nos 6 cenários.

Risco baixo, impacto direto na nota da experiência da sessão.