# Recuperação: parar de se diminuir na resposta

## O que aconteceu na conversa da Nanda

Ela perguntou "é tipo uma terapia?" — pergunta de quem está interessada, não de quem está desconfiada. O agente respondeu abrindo com três negações seguidas: "Não é terapia", "não faz diagnóstico", "não substitui um psicólogo". Depois se descreveu como "uma assistente que te ajuda no dia a dia, como um apoio pra organizar seus pensamentos e praticar o autoconhecimento".

Isso lê como versão fraca de terapia. Ela perguntou o que a Aura É e recebeu uma lista do que a Aura NÃO É.

A causa está em dois lugares verificados:

- Base de conhecimento: o item técnico "Aura substitui terapia?" começa com "Não." e o item de objeção "Já tentei terapia / outro app" termina com "Não substitui terapia". O agente copia esse tom.
- Prompt: manda "tranquilizar com FATO, não com adjetivo" e proíbe entusiasmo publicitário, mas não proíbe em nenhum lugar se autodepreciar, se comparar por baixo ou abrir a mensagem por negação.

## O que muda

**1. Proibição explícita de desvalorizar.** Regra nova no prompt, no mesmo peso da regra de duas camadas:
- Nunca abrir mensagem por negação ("não é", "não faz", "não substitui").
- Nunca se posicionar como versão menor de outra coisa. A Aura não é comparada por baixo com terapia, app ou psicólogo.
- Vocabulário banido por esvaziar valor: "ferramenta", "assistente", "apoio pra organizar pensamentos", "praticar autoconhecimento", "complementa", "não substitui", "não faz diagnóstico".
- Ressalva clínica só entra se o lead pedir tratamento, diagnóstico ou remédio, ou sinalizar risco — e nunca como abertura.

**2. Como responder "é terapia?" e comparações em geral.** Responder pelo que a Aura é, em cena, e deixar a diferença aparecer sozinha — e responder em nível "quero isso agora", não em nível "é legal". Padrão do que a resposta precisa fazer a pessoa sentir:

- Ela tem alguém que já sabe a história dela, disponível na hora exata em que aperta — 23h, meio da reunião, domingo à tarde.
- Ela pode marcar um encontro guiado de 45 minutos pra hoje à noite, hoje mesmo, sem espera de semanas e sem sala de espera: uma conversa que vai fundo e da qual ela sai com um caminho escrito, não com "vamos ver na próxima".
- Quando o peito aperta, chega um áudio com a voz dela conduzindo até passar — no momento, não um link pra procurar depois.
- Toda semana chega um episódio novo da trilha do que ela está vivendo: ela sente que está caminhando, não só desabafando.

**3. Elevar as cenas da vitrine (nível A) ao padrão "quero isso na hora".** As três cenas atuais são boas mas ainda descritivas. Passam a ser reescritas como momento vivido, com detalhe sensorial e resultado concreto no fim: o que ela escreve, o que chega, o que muda depois. Cada cena ganha um fecho de consequência ("e você dorme", "e você sai com um caminho", "e na semana seguinte tem mais"). Sem adjetivo publicitário, sem promessa de cura — a força vem do detalhe, não do superlativo.

**4. Reescrita dos dois itens da base que ensinam o tom errado.** Os dois passam a abrir pelo que a Aura entrega e só depois, em uma linha, dizer que não é tratamento clínico — sem "complementa" nem "não substitui" como fecho. Entra também um item novo para a pergunta exata "é tipo terapia?", escrito no padrão de cena.

**5. Cena obrigatória de nível A também nas perguntas de comparação.** Hoje a regra das duas camadas vale genericamente; passa a ser explícita: pergunta sobre o que a Aura é / se compara com algo exige uma cena do nível A na mesma mensagem, nunca uma definição funcional. Definição sem cena passa a ser erro.

**6. Frase de fechamento com convite, não com disclaimer.** A última linha antes do link não pode ser ressalva; tem que ser a cena ou uma pergunta concreta de fechamento ("quer marcar o primeiro encontro pra hoje à noite?").


## Detalhes técnicos

- `UPDATE recovery_agent_config SET system_prompt = ...` (id=1): nova seção "PROIBIDO SE DIMINUIR" com lista de aberturas e termos banidos, regra de comparação (responder pelo que é, em cena) e regra de posição do disclaimer clínico. Sem tocar em `enabled`, `model`, `max_auto_replies` ou janela de silêncio.
- `recovery_knowledge_base`: `UPDATE` em `d89b244b` (tecnico, "Aura substitui terapia?") e `588291ff` (objecao, "Já tentei terapia / outro app"); `INSERT` de um item `objecao` para "é tipo terapia? / é psicólogo?" no padrão de cena. Categorias já são sempre injetadas — nada muda em `ALWAYS_CATEGORIES`.
- `supabase/functions/recovery-agent/index.ts`: no parágrafo de instrução do `contextBlock`, acrescentar que pergunta de identidade/comparação exige cena do nível A e não aceita definição funcional. `VALUE_SHOWCASE` e `renderValueShowcase()` permanecem como estão.
- Deploy da edge function e atualização da memória do projeto (KB e postura do recovery-agent).
- Sem envio de mensagem real em nenhuma etapa de verificação.
