# Recuperação: vitrine que gera desejo (memória sai do palco)

## O problema

Na resposta automática enviada pra Rosemeire, o agente escolheu **memória de longo prazo** como "a grande diferença". Faz sentido a sua leitura: memória é *higiene mínima* na cabeça do cliente — se ela esquecesse, seria defeito. Ninguém compra por causa disso.

Hoje a vitrine (`VALUE_SHOWCASE` no `recovery-agent`) é uma lista plana de 7 recursos, todos com o mesmo peso, e o item "memória" está escrito como se fosse o clímax ("Ela lembra: você conta uma coisa hoje e semanas depois ela puxa aquilo de volta"). O agente pega o que parecer mais impressionante escrito — e esse item ganha.

## O que muda

**1. A vitrine ganha hierarquia de desejo (3 níveis).**

- **Nível A — momentos que a pessoa quer pra si** (é daqui que o agente escolhe por padrão): a madrugada sem ninguém pra chamar, o áudio de meditação chegando na hora do aperto, o encontro guiado de 45 min marcado pra hoje à noite, a trilha que ela conduz semana a semana, poder desabafar por áudio no carro sem digitar nada.
- **Nível B — provas de que funciona** (só entra como reforço de uma cena do nível A, nunca sozinho): portal com o histórico, insights que ela devolve, resposta em minutos a qualquer hora.
- **Nível C — pressuposto, não venda** (só se o lead perguntar): memória de longo prazo, sem app pra baixar, sem senha. Marcado no prompt como "isso o lead já espera — não use como argumento principal".

**2. As cenas do nível A são reescritas em primeira pessoa e no momento.** Sai "recurso + explicação", entra "situação + o que você sente". Exemplo do padrão: em vez de "meditação guiada em áudio na hora do aperto", vira "você escreve que não consegue dormir e em segundos chega um áudio com a voz dela te conduzindo até o sono — não um link, um áudio pra você agora".

**3. A memória é rebaixada no texto.** Deixa de ser "a grande diferença" e passa a ser uma frase de apoio, só usável junto de outra coisa: "e ela não te faz recomeçar do zero".

**4. Instrução de escolha explícita no prompt.** O bloco de montagem passa a dizer: escolha UMA cena do NÍVEL A que converse com o que o lead acabou de dizer; nunca abra a mensagem por nível C; se as cenas A relevantes já foram citadas, aprofunde uma delas em vez de descer pra C.

**5. Guarda contra reincidência.** Além do `[JÁ CITADO]` atual, o nível C nunca aparece como opção de escolha quando o lead não tocou no assunto — ele é renderizado numa seção separada, rotulada como pressuposto.

## Fora de escopo

Não altero o `system_prompt` (fica no banco, configurável), nem as travas de pausa/quiet hours/limite de respostas, nem os textos de PIX/valores.

## Detalhe técnico

Arquivo único: `supabase/functions/recovery-agent/index.ts`.

- `VALUE_SHOWCASE` passa a ter `tier: "A" | "B" | "C"` por item, com os textos reescritos.
- `renderValueShowcase()` passa a renderizar três blocos rotulados (CENAS QUE GERAM DESEJO / PROVAS DE APOIO / PRESSUPOSTOS — NÃO VENDA), mantendo o marcador `[JÁ CITADO — não repita]`.
- O parágrafo de instrução dentro de `contextBlock` troca "mostre UMA coisa concreta da vitrine" por "mostre UMA cena do NÍVEL A, em cena e no presente; nunca use item do nível C como argumento".
- Deploy da função ao final.
