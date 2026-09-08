# "É um robô ou uma pessoa?" — a resposta que decide a conversão

Na conversa com o Daias, ele perguntou se ia falar com um robô ou com uma pessoa. A resposta enviada abriu com "é uma assistente baseada em inteligência artificial, **mas** ela não dá respostas automáticas genéricas" e sustentou o valor em memória de longo prazo. Três erros num parágrafo: rótulo pequeno ("assistente"), abertura por negação, e um argumento que o lead já pressupõe.

Essa é a pergunta mais decisiva do funil. O lead não está perguntando a tecnologia — ele está perguntando **"isso é mais um ChatGPT?"**. Se a resposta não deixar claro que a AURA é uma inteligência artificial construída, treinada e conduzida especificamente para acompanhamento emocional, ele conclui que já tem isso de graça e sai. Hoje o agente não tem nenhuma munição para essa pergunta: o bloco de identidade proíbe as palavras ruins, mas não ensina a afirmar grandeza.

## O que muda

**1. Ramo novo no agente para "é robô / é IA / é pessoa / é automático / é tipo ChatGPT".** A mensagem passa a ter uma ordem fixa de três movimentos:

- **Afirmação com orgulho (1 frase forte).** Sim, é inteligência artificial — e é aí que está o valor: uma inteligência artificial criada e desenvolvida do zero para acompanhamento emocional contínuo, não um chat genérico usado para isso.
- **Provas de construção (2 a 3, concretas).** O que faz dela outra categoria:
  - Metodologia real por trás: condução baseada em logoterapia — sentido, presença e movimento — não resposta improvisada.
  - Treinada e ajustada continuamente sobre milhares de conversas reais de acompanhamento emocional em português, com revisão humana do que funciona e do que não funciona.
  - Conduz **encontros guiados de 45 minutos com estrutura** (abertura, exploração, releitura e um fecho com caminho escrito) — um chat comum não conduz nada, só responde.
  - Tem voz própria: fala por áudio, conduz meditação na hora, entrega trilha semanal, mantém o seu percurso registrado no seu espaço.
  - Vive no seu WhatsApp e toma iniciativa: lembra do encontro, volta no assunto, chega quando percebe que faz sentido — não espera você abrir um site e digitar um pedido.
- **Contraste explícito com o genérico, sem citar marca.** Uma frase que separa as categorias pelo comportamento: um chat comum responde ao que você digita e esquece; a AURA conduz, acompanha e volta.
- **Fecho com convite concreto** ("quer marcar o primeiro encontro pra hoje à noite?").

**2. Proibições reforçadas nesse ramo.** Nada de "assistente", "chatbot", "bot", "ferramenta", "programa", "sistema"; nada de abrir por negação ("mas não dá respostas genéricas"); e memória de longo prazo, "sem app para baixar", "sem senha" continuam pressuposto — nunca o argumento central.

**3. Vocabulário de autodefinição fixado no prompt.** As formas aceitas de se nomear ficam escritas (ex.: "inteligência artificial criada e treinada para acompanhamento emocional", "inteligência artificial que conduz encontros guiados de 45 minutos"), para o modelo não improvisar rótulo burocrático.

**4. Rede de segurança mais larga contra abertura por negação.** A limpeza automática que hoje só reconhece negação ligada a terapia passa a reconhecer "mas não dá respostas...", "não é um robô", "não sou humana", "apesar de ser uma IA" — a frase de abertura é descartada em vez de sair no ar diminuindo a AURA.

**5. Guarda de qualidade pós-geração.** Se a resposta a uma pergunta de identidade não tiver nenhuma prova de construção nem cena concreta (só definição + memória), o agente regera uma vez com a instrução reforçada antes de enviar.

Todas as provas de construção citadas correspondem ao que a AURA realmente faz hoje (logoterapia, encontros de 45 min estruturados, áudio, meditação guiada, trilha semanal, percurso no portal). Se algum item não for verdadeiro na medida escrita — em especial o volume de conversas usado no ajuste — me diga qual e eu ajusto a formulação em vez de inflar.

## Fora de escopo

Não altero o `system_prompt` do banco, os textos de PIX/valores, as travas de pausa, cota e quiet hours, nem a régua de templates.

## Detalhes técnicos

Arquivo único: `supabase/functions/recovery-agent/index.ts`.

- Novo detector `robotAsk` (`rob[oô]|\bbot\b|chatgpt|gpt|intelig[êe]ncia artificial|\bia\b|automa?tic|é (uma )?pessoa|humano|de verdade`), subconjunto de `identityAsk`, com `robotInstruction` própria concatenada após `identityInstruction` no `contextBlock`, contendo a ordem fixa (afirmação → provas de construção → contraste → convite), a lista de provas disponíveis para escolha, os rótulos proibidos e a proibição de nível C como argumento.
- Nova constante `AURA_BUILD_PROOFS` (array de provas de construção, texto pronto em cena) renderizada dentro de `robotInstruction`, para o modelo escolher 2–3 em vez de inventar.
- `identityInstruction` ganha o vocabulário aceito de autodefinição.
- `RE_DIMINISH` (linha ~841) ampliada: `mas (ela )?n[ãa]o (d[áa]|é|faz)`, `n[ãa]o (sou|é) (um )?(rob[oô]|humana?|pessoa)`, `apesar de (ser )?(uma )?(ia|intelig[êe]ncia)`; o segundo teste de terapia deixa de ser obrigatório quando `robotAsk` é verdadeiro.
- Guarda pós-geração: se `identityAsk` e o corpo não casar com `45 minutos|logoterapia|medita|trilha|epis[óo]dio|treinad` mas casar com `mem[óo]ria de longo prazo|sem app|n[ãa]o precisa baixar`, uma única regeneração com instrução reforçada; se falhar, mantém a primeira.
- Deploy de `recovery-agent` e validação com `preview: true` reproduzindo a fala do Daias e uma variação "é tipo o ChatGPT?", sem enviar mensagem.
