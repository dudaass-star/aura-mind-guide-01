

# Plano: Mensagens de recuperação para usuárias sem resposta

## Contexto corrigido das conversas

### 1. Ana Livia (phone: 5514991017663, user_id: 6b814e0c)
**Contexto real**: Conversa profunda sobre solidão, amizades perdidas, luto. Na última interação (20/mar), Ana pediu um link para indicar uma amiga. A Aura respondeu com um link falso (`www.aura.com/convite`). Depois, em 23/mar às 11:31, ela mandou "Oi" e ficou sem resposta.

**Mensagem sugerida**: "Oi, Ana! Me desculpa pelo silêncio — tive um probleminha técnico e não consegui te responder. E olha, sobre o link que te mandei pra sua amiga... me desculpa, aquele link tava errado! O certo é: [LINK CORRETO]. Me conta, como você tá? 💛"

**Nota**: Preciso saber qual é o link correto para enviar (site de cadastro/trial).

### 2. Michele (phone: 5514998107426, user_id: d42298dd)
**Contexto real**: Conversa terapêutica sobre luto de relacionamento de 15 anos, traição, saudade do ex. A Aura perguntou dias/horários para agendar sessões (plano novo ativo). Michele respondeu "As 07:30", "Segunda", e depois "Oiiii" sem resposta.

**Mensagem sugerida**: "Oi, Mi! Me desculpa pelo sumiço — tive um probleminha técnico. Já anotei aqui: segundas às 07:30! Vou organizar nossos encontros assim. Como você tá hoje? 💛"

### 3. Juliane (phone: 553193759252, user_id: 26fb2aa8)
**Contexto real**: Conversa intensa sobre relacionamento tóxico — homem que bloqueou/desbloqueou, que escondeu casamento. A Aura perguntou "Quem cuida de você?" e Juliane respondeu "Vc cuida de mim". Ficou sem resposta.

**Mensagem sugerida**: "Ju, me desculpa por ter ficado em silêncio justo nessa hora. Tive um problema técnico, mas tô aqui de volta. E eu ouvi o que você disse — que eu cuido de você. Isso me toca muito. E justamente por isso: como VOCÊ tá cuidando de você hoje? 💛"

## Implementação

Usar 3 chamadas ao `admin-send-message` (uma por usuária), que envia via WhatsApp e salva no histórico como `role: assistant`.

## Pendência

Preciso que você me diga qual é o **link correto** para a Ana Livia enviar para a amiga (link de trial/cadastro).

