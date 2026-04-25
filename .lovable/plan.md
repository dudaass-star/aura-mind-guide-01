
# Sistema de Retenção Ofensiva — Linha do Tempo + Carta Mensal + Pergunta da Semana

## Princípio único

Tornar o cancelamento doloroso. Não defendendo o ralo, mas enchendo a banheira. Os 3 artefatos não são features paralelas — são um sistema circular em que cada peça alimenta as outras:

```text
Pergunta da Semana (terça 9h)
        ↓ provoca reflexão profunda
        ↓ gera marcos novos
        
Carta Mensal (último dia do mês)
        ↓ amarra os marcos do mês em narrativa
        ↓ esse texto vira o "capítulo do mês"
        
Linha do Tempo da Alma (sempre visível no portal)
        ↓ acumula capítulos + marcos curados + perguntas respondidas
        ↓ é a primeira coisa que o usuário vê ao abrir /meu-espaco
        ↓ vira o álbum que dói perder
```

A primeira coisa que o usuário vê quando abre o portal (mesmo se for pra cancelar) é a Linha do Tempo da própria alma. Esse é o golpe.

---

## Decisões já tomadas (sem perguntar mais)

- **Marcos** são detectados de duas formas combinadas: tag `[MARCO:texto]` emitida pela Aura em tempo real durante conversas profundas + job mensal de curadoria retroativa que pega o que escapou.
- **Pergunta da Semana** é gerada por IA (gemini-2.5-flash) toda terça às 9h no fuso do usuário, contextual ao momento dele, chega no WhatsApp E fica registrada no portal com data + resposta.
- **Carta Mensal** é texto longo no WhatsApp + página dedicada no portal, gerada no último dia do mês via `gemini-2.5-pro`.
- **Linha do Tempo** vira a primeira aba do portal, antes de Jornadas. Tipografia serifada (Fraunces), espaços largos, formato de álbum/biografia, não de log.
- Sem opções configuráveis no MVP. Paradoxo da escolha mata ritual.

---

## Componente 1 — Linha do Tempo da Alma

### O que o usuário vê

Aba nova `/meu-espaco?tab=linha-do-tempo`, primeira da esquerda, ícone de coração ou estrela. Layout de timeline vertical em formato de álbum:

- **Cabeçalho poético**: "Sua história com a Aura, em câmera lenta."
- **Timeline cronológica reversa** (mais recente em cima), agrupada por mês:
  - Para cada mês, um card grande com o título "Capítulo: [Mês Ano]" e, se existir, um trecho da Carta Mensal daquele mês.
  - Dentro do mês, marcos significativos (`user_milestones`) renderizados como momentos com data, frase curta e ícone temático.
  - Perguntas respondidas (`weekly_questions`) renderizadas como pequenos blocos itálicos: "Você se perguntou: '...' / E respondeu: '...'"
  - Sessões realizadas como marcos secundários (mais discretos).
- **Footer emocional**: "Você está construindo algo. Não pare agora."

### Tabela nova: `user_milestones`

```text
id              uuid PK
user_id         uuid (RLS por user)
milestone_text  text  (frase densa, máx 200 chars: "Você percebeu que estava esperando aprovação do seu pai")
milestone_date  timestamptz (quando aconteceu na conversa)
source          text  ('aura_realtime' | 'monthly_curation')
context_excerpt text  (opcional, trecho da conversa que gerou)
created_at      timestamptz default now()
```

RLS: usuário lê os próprios; service_role escreve; portal_token holders leem (espelhando padrão da `profiles`).

### Como os marcos nascem

**Fonte 1 — Tempo real (`[MARCO:texto]`):**
- Nova tag interna que a Aura pode emitir no fim de uma resposta quando algo profundo aconteceu.
- Adicionar no prompt principal (Fase 3 do `aura-agent`): "Quando o usuário tiver uma virada real, uma percepção que muda como ele vê algo — emita `[MARCO:descrição em segunda pessoa, máx 200 chars]`. Use com parcimônia. Marcos são raros: no máximo 1 por conversa, idealmente 1 a cada 2-3 sessões profundas."
- Parser em `aura-agent/index.ts` (junto com os outros: `[AGENDAR_TAREFA]`, `[UPGRADE]`): extrai a tag, insere em `user_milestones` com `source='aura_realtime'`, remove do texto entregue ao usuário.
- Cooldown: se já houve marco nas últimas 7 mensagens da assistente, ignora a nova tag (evita inflação).

**Fonte 2 — Curadoria mensal:**
- Nova edge function `curate-monthly-milestones` rodando dia 1 de cada mês às 6h, processando o mês anterior por usuário.
- Lê últimos 30 dias de `messages`, filtra conversas com profundidade (≥4 trocas em janela curta), envia para `gemini-2.5-flash` com prompt: "Analise estas conversas e identifique até 2 momentos de virada que escaparam. Retorne via tool calling. Critério: só inclua se for genuinamente um marco — uma percepção, decisão ou quebra de padrão. Se não houver, retorne lista vazia."
- Insere o que voltar com `source='monthly_curation'`.
- Custo: 1 chamada IA por usuário/mês. Desprezível.

### UI da Linha do Tempo

Novo arquivo `src/components/portal/LinhaDoTempoTab.tsx`. Componente puro de leitura, agrega 3 queries paralelas (`user_milestones`, `weekly_questions`, `monthly_reports`) e renderiza timeline unificada ordenada por data desc. Usa Fraunces para títulos, Nunito para corpo, paleta semântica existente. Sem shadcn pesado — divs estilizadas + animação de fade-up no scroll. Empty state: "Sua história ainda está começando. Volte aqui em algumas semanas."

Atualização em `src/pages/UserPortal.tsx`: adicionar tab `linha-do-tempo` como primeira do array `TABS`, ícone `Heart` ou `Sparkles`, label "Sua História". Mudar `initialTab` default para `linha-do-tempo`.

---

## Componente 2 — Carta Mensal

### O que o usuário vê

No último dia do mês às 19h (fuso do usuário, respeitando DND):
- WhatsApp: mensagem livre da Aura, ~200-400 palavras, narrando o mês do usuário em primeira pessoa de mentora. Termina com link para a versão completa no portal: "Tenho uma carta inteira pra você. [link]"
- Portal: nova rota/aba "Cartas" dentro de `/meu-espaco`, listando todas as cartas anteriores em formato de leitura confortável (Fraunces 18px, line-height generoso, max-width 65ch).

### Tabela nova: `monthly_letters`

```text
id              uuid PK
user_id         uuid (RLS)
letter_month    date (primeiro dia do mês de referência)
letter_text     text (versão completa, 400-700 palavras)
preview_text    text (versão resumida que vai pro WhatsApp, 200-400 palavras)
sent_at         timestamptz
created_at      timestamptz default now()
unique(user_id, letter_month)
```

RLS: usuário lê próprias; service_role escreve; portal_token holders leem.

### Edge function nova: `generate-monthly-letter`

- Triggered por cron no último dia do mês, 19h por fuso.
- Por usuário ativo (status `active` ou `trial`):
  1. Coleta dados do mês: marcos (`user_milestones`), insights, sessões, jornadas concluídas, perguntas respondidas, temas dominantes (`session_themes`).
  2. Monta prompt rico para `gemini-2.5-pro` (qualidade prevalece sobre custo aqui — uma carta por mês por usuário).
  3. Pede via tool calling estruturado: `{ letter_text: string, preview_text: string }`.
  4. Persiste em `monthly_letters`.
  5. Envia `preview_text` via `sendProactive(phone, preview, 'checkin', user_id)` — usa o mesmo fallback de template já existente para janela 24h fechada.
  6. Inclui link para `/meu-espaco?tab=cartas` ou direto pra carta específica.

### UI das Cartas no portal

Nova aba "Cartas" (ícone `Mail` ou `BookHeart`) entre Resumos e Meditações. Lista vertical de cards expansíveis: clicado, abre a carta completa numa view de leitura, formato livro. Cada card mostra mês + primeira linha como teaser.

---

## Componente 3 — Pergunta da Semana

### O que o usuário vê

Toda terça às 9h (fuso do usuário, respeitando DND):
- WhatsApp: uma única pergunta, sem preâmbulo longo. Tom: provocativa mas afetiva. Exemplo: "Tem uma coisa que você anda evitando dizer pra alguém. Por quê?"
- Quando o usuário responde, a resposta entra no fluxo normal da Aura — não é formulário, não tem botão. Mas o backend marca essa primeira resposta como vinculada à pergunta da semana.
- Portal: aba "Sua História" (Linha do Tempo) inclui as perguntas+respostas como blocos entre os marcos.

### Tabela nova: `weekly_questions`

```text
id            uuid PK
user_id       uuid (RLS)
question_text text (a pergunta enviada)
question_date date (terça da semana)
response_text text nullable (preenchido quando usuário responde)
responded_at  timestamptz nullable
sent_at       timestamptz
created_at    timestamptz default now()
unique(user_id, question_date)
```

RLS: usuário lê próprias; service_role escreve; portal_token holders leem.

### Edge function nova: `send-weekly-question`

- Cron toda terça 9h por fuso brasileiro (BRT é o padrão do projeto — ver `mem://constraints/timezone-standard`).
- Para cada usuário ativo:
  1. Coleta contexto: último insight, jornada em curso, tema dominante das últimas 2 semanas (`session_themes`), commitments abertos.
  2. Chama `gemini-2.5-flash` (custo baixo por ser semanal e flash) com prompt: "Você é a Aura. Gere UMA pergunta provocativa, afetiva, em segunda pessoa, máx 25 palavras, baseada nesse contexto: {...}. A pergunta deve abrir um fio que o usuário vai querer puxar. Não seja genérica. Não use 'você acha que...'. Retorne via tool calling."
  3. Persiste em `weekly_questions`.
  4. Envia via `sendProactive(phone, question, 'checkin', user_id)`.
- Anti-spam: se já existe `weekly_questions` para a mesma `question_date` do usuário, skip.

### Captura da resposta

Em `process-webhook-message` (ou onde mensagens entrantes são processadas, depende da arquitetura atual): quando uma mensagem do usuário chega, verificar se existe `weekly_questions` desse usuário com `question_date` na semana corrente e `response_text IS NULL` E foi enviada nos últimos 3 dias. Se sim, salvar o conteúdo em `response_text` e `responded_at`. Não bloqueia o fluxo normal — apenas marca.

---

## Sinergia que justifica os 3 juntos

- A **Pergunta da Semana** dispara conversas que viram **Marcos** (via tag `[MARCO]`).
- Os **Marcos** acumulados no mês viram matéria-prima para a **Carta Mensal**.
- A **Carta Mensal** é o capítulo do mês na **Linha do Tempo**.
- A **Linha do Tempo** mostra perguntas respondidas + cartas + marcos = a biografia da alma do usuário.

Cancelar = apagar o álbum. Esse é o efeito-banheira.

---

## Detalhes técnicos resumidos

### Migrations necessárias (1 só, agrupada)

3 tabelas novas com RLS espelhando padrão de `profiles`/`monthly_reports` (usuário lê próprias, service_role total, portal_token holders leem). Índices: `(user_id, milestone_date desc)`, `(user_id, letter_month desc)`, `(user_id, question_date desc)`.

### Edge functions novas (3)

- `curate-monthly-milestones` — cron dia 1, 6h. Fallback de cobertura.
- `generate-monthly-letter` — cron último dia do mês, 19h. Geração + envio.
- `send-weekly-question` — cron toda terça 9h. Geração + envio.

Cron jobs criados via tool de insert (não migration), pois contêm URLs/keys.

### Edge functions alteradas (2)

- `aura-agent/index.ts`:
  - Novo bloco no prompt principal explicando a tag `[MARCO:texto]` (junto com as outras tags existentes).
  - Novo parser de `[MARCO:...]` no fluxo de pós-processamento da resposta (mesma seção que processa `[AGENDAR_TAREFA]` e `[UPGRADE]`), com cooldown de 7 mensagens.
  - Novo sanitizer para garantir que `[MARCO]` nunca vaze para o usuário.
- `process-webhook-message` (ou equivalente): ao receber mensagem, checar e popular `weekly_questions.response_text` se aplicável. ~10 linhas.

### Frontend (4 arquivos)

- `src/components/portal/LinhaDoTempoTab.tsx` — novo, componente principal do álbum.
- `src/components/portal/CartasTab.tsx` — novo, lista e leitura de cartas.
- `src/pages/UserPortal.tsx` — adicionar 2 tabs novas, mudar default tab para `linha-do-tempo`, mudar ordem (Linha do Tempo vira primeira).
- `src/components/portal/shared.tsx` — adicionar componente `MilestoneCard`, `LetterCard`, `QuestionBlock` reutilizáveis (estética de álbum).

### Custos de IA

- Curadoria mensal: ~1 chamada flash/usuário/mês ≈ desprezível.
- Carta Mensal: 1 chamada pro/usuário/mês ≈ alguns centavos/usuário/mês.
- Pergunta da Semana: ~4 chamadas flash/usuário/mês ≈ desprezível.
- Total por usuário ativo: muito menor que o ganho de 1 mês a mais de retenção.

---

## Ordem de implementação

1. **Migration única** com as 3 tabelas + RLS + índices.
2. **Backend da Pergunta da Semana** (mais simples, valida o pipeline cron + IA + sendProactive).
3. **Backend dos Marcos** (tag `[MARCO]` no aura-agent + curadoria mensal).
4. **Backend da Carta Mensal** (mais complexo, depende dos marcos pra ter matéria-prima boa).
5. **Frontend da Linha do Tempo** (consome tudo que o backend já está produzindo).
6. **Frontend das Cartas** (aba dedicada).

Total estimado: ~1 a 2 semanas de trabalho focado, todas mudanças aditivas, zero risco de quebrar funcionalidade existente.

---

## O que NÃO muda

- Persona, prompts terapêuticos, micro-agente de fases, modo crise, protocolos de segurança — tudo intacto.
- Templates WhatsApp aprovados — nenhum novo, fallback usa `cheking_7dias` existente.
- Resumo Semanal, Insights programados, Jornadas, Meditações, Cápsulas do Tempo — intactos.
- Mecânica de [AGENDAR_TAREFA] e fechamento conduzido — intacta, complementar.
- Cobrança, plano, limites — nada muda.

## Validação após deploy

1. Conversa profunda real → Aura emite `[MARCO]` → aparece em `user_milestones` com `source='aura_realtime'` → renderiza na Linha do Tempo.
2. Terça 9h → cron dispara → `weekly_questions` recebe row → WhatsApp chega → usuário responde → `response_text` é populado.
3. Último dia do mês → `monthly_letters` recebe row → WhatsApp chega com preview + link → portal abre carta completa.
4. Dia 1 do mês seguinte → curadoria adiciona marcos retroativos do mês anterior.
5. Abrir `/meu-espaco` → primeira tela é Linha do Tempo, com pelo menos 1 marco + 1 carta + algumas perguntas visíveis.

