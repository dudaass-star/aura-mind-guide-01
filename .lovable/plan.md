# Recuperação: vitrine que gera desejo (memória sai do palco)

## O problema

Na resposta automática enviada pra Rosemeire, o agente escolheu **memória de longo prazo** como "a grande diferença". Faz sentido a sua leitura: memória é *higiene mínima* na cabeça do cliente — se ela esquecesse, seria defeito. Ninguém compra por causa disso.

Hoje a vitrine (`VALUE_SHOWCASE` no `recovery-agent`) é uma lista plana de 7 recursos, todos com o mesmo peso, e o item "memória" está escrito como se fosse o clímax ("Ela lembra: você conta uma coisa hoje e semanas depois ela puxa aquilo de volta"). O agente pega o que parecer mais impressionante escrito — e esse item ganha.

## O que muda

**1. A vitrine ganha hierarquia de desejo (3 níveis).**

- **Nível A — coisas que o cliente quer pra si** (escolha padrão do agente):
  - **Encontro guiado de 45 min** — conversa funda marcada por WhatsApp, na hora que quiser.
  - **Meditações guiadas disponíveis a qualquer momento** — áudio específico para o que está apertando ali, sem abrir outro app.
  - **Jornadas de conhecimento / trilha semanal** — episódio novo chegando a cada semana, conduzido no ritmo da pessoa.
- **Nível B — provas de que funciona / conforto no uso** (só entra como reforço de uma cena do nível A, nunca como argumento principal): falar por áudio sem digitar, resposta a qualquer hora, portal guarda histórico, ela não recomeça do zero.
- **Nível C — pressuposto, não venda** (só se o lead perguntar): memória de longo prazo, sem app pra baixar, sem senha. Marcado como "o lead já espera — não use como argumento".


**2. As cenas do nível A são reescritas em primeira pessoa e no momento.** Sai "recurso + explicação", entra "situação + o que você sente". Exemplo do padrão: em vez de "meditação guiada em áudio na hora do aperto", vira "você escreve que não consegue dormir e em segundos chega um áudio com a voz dela te conduzindo até o sono — não um link, um áudio pra você agora".

**3. A memória é rebaixada no texto.** Deixa de ser "a grande diferença" e passa a ser uma frase de apoio, só usável junto de outra coisa: "e ela não te faz recomeçar do zero".

**4. Instrução de escolha explícita no prompt.** O bloco de montagem passa a dizer: escolha UMA cena do NÍVEL A que converse com o que o lead acabou de dizer; nunca abra a mensagem por nível C; se as cenas A relevantes já foram citadas, aprofunde uma delas em vez de descer pra C.

**5. Guarda contra reincidência.** Além do `[JÁ CITADO]` atual, o nível C nunca aparece como opção de escolha quando o lead não tocou no assunto — ele é renderizado numa seção separada, rotulada como pressuposto.

## Fora de escopo

Não altero o `system_prompt` (fica no banco, configurável), nem as travas de pausa/quiet hours/limite de respostas, nem os textos de PIX/valores.

## Detalhe técnico

Arquivo único: `supabase/functions/recovery-agent/index.ts`.

- `VALUE_SHOWCASE` passa a ter `tier: "A" | "B" | "C"` por item, com os textos reescritos no padrão "você... agora" em vez de " recurso X".

- `renderValueShowcase()` passa a renderizar três blocos rotulados (CENAS QUE GERAM DESEJO / PROVAS DE APOIO / PRESSUPOSTOS — NÃO VENDA), mantendo o marcador `[JÁ CITADO — não repita]`.
- O parágrafo de instrução dentro de `contextBlock` troca "mostre UMA coisa concreta da vitrine" por "mostre UMA cena do NÍVEL A, em cena e no presente; nunca use item do nível C como argumento".
- Deploy da função ao final.
