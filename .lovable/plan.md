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

## O que corrigir no produto

1. **Preferência de áudio persistente.** Hoje o pedido de áudio vale só para o turno; não fica gravado no perfil. Passar a gravar a preferência (`texto` / `áudio` / `misto`) quando o usuário pedir explicitamente, e respeitá-la em todos os turnos seguintes até ele mudar — com aviso transparente quando o teto mensal de áudio do plano acabar, em vez de voltar para texto em silêncio.
2. **Auditabilidade do canal.** Registrar em cada mensagem se saiu como áudio ou texto. Hoje é impossível provar no banco o que foi entregue — só o contador de abertura de sessão existe.
3. **Freio de interpretação para quem já corrigiu.** Quando o usuário tiver correções recentes do tipo "não interprete", a Aura deve entrar em modo descritivo: só devolver o que a pessoa disse com as palavras dela, e nunca rotular (`fúria`, `grito`, `personificação`, `você fundiu sua identidade`) sem que o termo tenha saído da boca do usuário. Reframe só como hipótese verificável ("faz sentido pra você ou tô lendo errado?").
4. **Rota "orientação prática" dentro da sessão.** Quando o pedido de foco é explicitamente por orientação/técnica, entregar conteúdo útil (3 movimentos concretos para relatar não conformidade sem desgaste) antes de investigar, em vez de encadear perguntas socráticas até o tempo acabar.
5. **Silenciar ruído pós-sessão.** Bloquear mensagens vazias tipo "E aí" e não cobrar compromisso que o usuário já declarou inaplicável na sessão seguinte.

## Ação com a usuária

Resposta honesta assumindo os dois pontos (áudio ignorado e leitura imposta), sem terapia de justificativa, com oferta de escolha: crédito/reembolso do ciclo e cancelamento sem atrito, ou uma sessão de retorno já no formato que ela pediu (áudio + orientação prática). Recomendo oferecer o reembolso primeiro — ela pagou 7 dias e a experiência entregue não cumpriu o combinado explícito.

## Detalhes técnicos

- `supabase/functions/aura-agent/index.ts`: `determineAudioMode()` (linha ~1795) e `userWantsAudio()` (~3568) resolvem áudio por turno; nenhuma escrita de preferência em `profiles`. Adicionar coluna de preferência + leitura antes da decisão, com o teto de orçamento (`budgetSeconds`) intacto.
- `messages` tem apenas 5 colunas (sem flag de canal): incluir `is_audio boolean` preenchido pelo `process-webhook-message` na persistência por bolha.
- Bloco anti-interpretação já existe para usuário novo (`isNewUser`); estender a mesma injeção para usuários com N correções recentes de `user_memory_corrections`, com lista de termos proibidos derivada das correções.
- Sem migrações destrutivas; nenhuma alteração em cobrança fora da ação manual de reembolso.
