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
- **Migração (nova coluna):** `profiles.voice_mode text default 'auto'`, valores `auto | audio | texto`. Sem alteração de RLS (perfil já é protegido); GRANT igual às demais colunas.
- **Escrita:** no mesmo ponto onde hoje calculo `wantsAudio` / `wantsText`, gravar `voice_mode='audio'` quando o pedido for explícito ("fala por áudio", "exclusivamente por áudio") e `'texto'` quando pedir texto. Uma linha de `update` no perfil, fire-and-forget.
- **Leitura:** dentro de `determineAudioMode()`, nova regra imediatamente após a checagem de crise:
  `if (voiceMode === 'audio' && budgetAvailable) → { shouldUseAudio: true, reason: 'user_preference', mandatory: true }`
  `mandatory: true` é o ponto crítico — é o que faz `splitIntoMessages()` (linha ~4081) gerar áudio sem depender da tag do LLM.
- **Teto de orçamento intacto:** `budgetSeconds` (30/90/180 min por plano) continua mandando. A diferença é que quando o teto acaba a Aura **avisa em uma frase** ("meu áudio do mês acabou, sigo por texto") em vez de voltar a texto em silêncio, que foi exatamente o que gerou 9 correções da Elisabete.
- **Sai do escopo do turno:** nada muda para quem não pede nada — `auto` mantém o comportamento atual (aberturas + tag do modelo).

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

### 4. Reframe repetido: fechar o furo que a auditoria apontou

**Como é hoje:** já existe a trava de hipótese "sticky" (`aura_hypothesis_delivered` / `user_rejected_hypothesis`). No caso dela o extractor marcou `user_validated_hypothesis: true` para uma concordância passiva ("Isso mesmo. Como?"), e a Aura tratou como aval para continuar impondo — é a red flag `concordancia_passiva_tratada_como_reflexao` da própria auditoria.

**O que muda:** endurecer a regra de validação no prompt do extractor — resposta de ≤4 palavras, ou pergunta de volta, **não** conta como `user_validated_hypothesis`. Só conta quando o usuário elabora com conteúdo próprio. É alteração de texto do extractor, sem lógica nova.

### 5. Rota "orientação prática" dentro da sessão

**Como é hoje:** quando o foco declarado da sessão é pedido de orientação ("que você me oriente sobre comunicação assertiva"), o fluxo segue igual: perguntas encadeadas até o tempo acabar. Ela terminou com "não teve nada além do que eu já sabia" e a auditoria marcou as 4 camadas como não cobertas.

**O que muda:** no bloco de fase de exploração, acrescentar instrução: quando o pedido de foco for explicitamente por orientação/técnica, **entregar de 2 a 3 movimentos concretos e aplicáveis primeiro**, e só depois investigar o que trava a aplicação. Continua uma pergunta por resposta e o mesmo limite de balões. É texto de prompt, aproveitando a mesma abordagem já aprovada no plano "Aura útil no dia a dia".

### 6. Cortar o ruído pós-sessão

**Como é hoje:** às 13:03 a sessão foi encerrada; às 13:20 saiu uma mensagem solta "E aí" (follow-up de conversa em `supabase/functions/conversation-followup/index.ts`, que só checa inatividade e não checa se a sessão acabou de ser fechada). No dia seguinte o lembrete de compromisso cobrou o "Termômetro", que ela já havia dito na própria sessão que não teve situação para aplicar.

**O que muda:**
- `conversation-followup`: pular o usuário quando houver sessão encerrada nos últimos 60 minutos (uma condição a mais na lista de skips que já existe na função).
- Lembrete de compromisso: não cobrar compromisso quando na sessão seguinte o usuário já declarou que não houve situação para aplicar — usa a regra de `cancel_topics` que já existe no post-analysis, estendida para marcar o compromisso como não aplicável em vez de deixá-lo pendente.

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

