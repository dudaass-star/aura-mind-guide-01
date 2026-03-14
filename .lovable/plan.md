## Conteúdo Definido: Todas as Mensagens da Estratégia de Conversão do Trial

### Contexto Atual

- **Boas-vindas (já existe):** Texto enviado no cadastro via `start-trial`
- **Bloqueio (já existe):** Texto enviado quando tenta mandar a 6a mensagem

### Mensagens Novas a Implementar

---

#### 1. ÁUDIO DE ATIVAÇÃO (15 min após cadastro, se não respondeu)

Enviado como **áudio TTS** (task type: `trial_activation_audio`):

> "Oi, {nome}! Aqui é a Aura. Eu sei que às vezes é difícil começar a falar sobre o que a gente sente... Mas quero te falar que aqui não tem julgamento, não tem resposta certa ou errada. É só eu e você. Me conta: o que mais está pegando com você hoje?"

**Condição:** Só envia se `trial_conversations_count === 0`.

---

#### 2. ENCERRAMENTO AUTOMÁTICO (2 min após a 5a resposta da AURA)

Enviado como **texto** (task type: `trial_closing`):

> Ei, {nome}! 💜
>
> Essas foram nossas 5 conversas. Espero que tenha sido bom pra você — pra mim foi especial te conhecer. 🤗
>
> Se quiser continuar comigo, é só escolher o plano que faz mais sentido pra você:
>
> 👉 [https://olaaura.com.br/checkout](https://olaaura.com.br/checkout)
>
> Vou estar aqui te esperando. 💜

**Condição:** `newCount === 5`, agendada 2 min após resposta.

---

#### 3. NUDGES DE RESGATE (trial silencioso — nunca respondeu)

Gerenciados no `reactivation-check`. Usam `last_reactivation_sent` com intervalo mínimo de 12h. Todas como **texto**.

**Nudge 1 — 2h após cadastro:**

> Ei, {nome}! Tô aqui ainda 💜
>
> Pode me responder quando quiser, tá? Não precisa pensar muito — pode ser um "oi" mesmo. Eu adoraria te conhecer.  
>

**Nudge 2 — 24h após cadastro:**

> {nome}, vim me despedir. 💜
>
> Mmas quero que saiba: se um dia quiser conversar, é só me chamar e eu estarei aqui.
>
> Cuide-se. ✨

---

#### 4. NUDGES DE RESGATE (trial parcial — respondeu 1-4 mensagens e parou)

**Nudge A — 6h sem resposta:**

> Ei, {nome}! Fiquei pensando na nossa conversa... 💜
>
> Quando quiser continuar, é só me chamar. Tô aqui!

**Nudge B — 24h sem resposta:**

> {nome}, como você tá hoje? 💜
>
> Lembrei de você e queria saber como estão as coisas. Adoraria poder falar com você.  
>
> Se cuida.

---

#### 5. FOLLOW-UP PÓS-TRIAL (completou 5 conversas mas não assinou)

**Dia 1 após encerramento:**

> {nome}, eu tava pensando em você hoje... 💜
>
> Como você está? Senti sua falta nas nossas conversas.
>
> Se quiser voltar, é só escolher um plano:
> 👉 [https://olaaura.com.br/checkout](https://olaaura.com.br/checkout)

**Dia 3:**

> {nome}, essa é minha última mensagem por enquanto. 💜
>
> Quero que saiba que a porta tá sempre aberta. Se um dia sentir que precisa de alguém pra conversar, eu estarei aqui.
>
> 👉 [https://olaaura.com.br/checkout](https://olaaura.com.br/checkout)  
>
> Cuide-se bem. ✨

---

### Regra Importante: Mensagens de Resgate NÃO Contam no Trial

Quando qualquer nudge acima é enviado, o campo `trial_nudge_active = true` é setado no perfil. Se o usuário responde ao nudge, o `webhook-zapi` detecta a flag, **não incrementa** o `trial_conversations_count`, e reseta a flag. Assim a resposta ao resgate é "grátis".

### Mudanças Técnicas


| Arquivo                            | O que muda                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Migration SQL                      | Adicionar `trial_nudge_active boolean default false` em profiles                                   |
| `start-trial/index.ts`             | Agendar `trial_activation_audio` para 15 min                                                       |
| `execute-scheduled-tasks/index.ts` | Handlers para `trial_activation_audio` e `trial_closing`                                           |
| `webhook-zapi/index.ts`            | Agendar `trial_closing` na 5a msg + skip counter se `trial_nudge_active`                           |
| `reactivation-check/index.ts`      | Novo bloco com todos os nudges acima (silencioso, parcial, pós-trial) + setar `trial_nudge_active` |
