# "É um robô ou uma pessoa?" — resposta que hoje esvazia a AURA

Na conversa com o Daias, ele perguntou se ia falar com um robô ou com uma pessoa. A resposta enviada abriu com "é uma assistente baseada em inteligência artificial, **mas** ela não dá respostas automáticas genéricas" e sustentou o valor em memória de longo prazo. Ou seja: rótulo pequeno ("assistente"), abertura por negação e um argumento que o lead já pressupõe. Não gera nenhum "eu preciso experimentar isso".

O que existe hoje no agente de recuperação: a pergunta cai no bloco de identidade (o "robô" é reconhecido), que já proíbe a palavra "assistente" e abre por cena. Duas brechas deixaram passar: (1) não há nenhuma instrução sobre **como afirmar que é inteligência artificial com orgulho** quando o lead pergunta exatamente isso — o modelo improvisa o rótulo mais burocrático que conhece; (2) a limpeza automática de abertura por negação só age quando a frase fala de terapia/psicólogo, então "mas ela não dá respostas automáticas genéricas" passou intacta.

## O que muda

**1. Ramo novo: pergunta "é robô / é IA / é pessoa / é automático".**

Quando o lead pergunta isso, a mensagem passa a ter uma ordem fixa:

- **Afirmar com orgulho, em uma frase de peso**: sim, é inteligência artificial — criada e desenvolvida especificamente para acompanhamento emocional contínuo, não um chat genérico adaptado. A afirmação é a força da resposta, não uma ressalva.
- **Provar na hora com UMA cena do nível A** (encontro guiado de 45 min marcado pra hoje à noite; o áudio de meditação que chega às 23h e te leva até o sono; o episódio novo da trilha toda semana) — a prova vem do que ela faz, não do que ela tem.
- **Fechar com convite concreto** ("quer marcar o primeiro encontro pra hoje à noite?").

Proibido nesse ramo: "assistente", "chatbot", "ferramenta", "sistema", "programa", "bot"; abrir por negação ("mas não dá respostas genéricas", "não é um robô comum"); e sustentar a resposta em memória de longo prazo, "não precisa baixar app" ou qualquer item de nível C — que continuam sendo pressuposto, nunca argumento.

**2. Vocabulário de grandeza definido no prompt, não improvisado.** O bloco passa a dar as formas aceitas de nomear a AURA (inteligência artificial criada e desenvolvida para acompanhamento emocional; inteligência artificial que conduz encontros guiados de 45 minutos) para o modelo não cair em "assistente baseada em IA".

**3. Rede de segurança mais larga contra abertura por negação.** A limpeza que hoje só reconhece negação ligada a terapia passa a reconhecer também "mas não dá respostas...", "não é um robô", "não sou humana", "apesar de ser uma IA" quando a pergunta é de identidade — a frase de abertura é descartada em vez de sair no ar diminuindo a AURA.

**4. Guarda contra memória como argumento principal em pergunta de identidade.** Se a resposta gerada sustenta o valor em memória/conveniência e não traz nenhuma cena de nível A, ela é regerada uma vez com a instrução reforçada, em vez de ser enviada assim.

## Fora de escopo

Não altero o `system_prompt` do banco, os textos de PIX/valores, as travas de pausa, cota e quiet hours, nem a régua de templates.

## Detalhes técnicos

Arquivo único: `supabase/functions/recovery-agent/index.ts`.

- Novo detector `robotAsk` (regex sobre `text`: `rob[oô]|bot\b|intelig[êe]ncia artificial|\bia\b|automa?tic|é (uma )?pessoa|humano|de verdade`), subconjunto de `identityAsk`, com `robotInstruction` própria concatenada depois de `identityInstruction` no `contextBlock` (ordem: afirmação → cena nível A → convite; lista de rótulos proibidos; proibição explícita de nível C como argumento).
- `identityInstruction` ganha o vocabulário aceito de autodefinição.
- `RE_DIMINISH` (linha ~841) ampliada: `mas (ela )?n[ãa]o (d[áa]|é|faz)`, `n[ãa]o (sou|é) (um )?(rob[oô]|humana?|pessoa)`, `apesar de (ser )?(uma )?(ia|intelig[êe]ncia)`, e o segundo `test` de terapia deixa de ser obrigatório quando `robotAsk` é verdadeiro.
- Guarda pós-geração: se `identityAsk && !/45 minutos|medita|trilha|epis[óo]dio/i.test(body)` e `/mem[óo]ria de longo prazo|n[ãa]o precisa baixar|sem app/i.test(body)`, uma segunda chamada ao modelo com a instrução reforçada (uma única retentativa; se falhar, mantém a primeira).
- Deploy de `recovery-agent` ao final e validação com `preview: true` reproduzindo a fala do Daias, sem enviar mensagem.
