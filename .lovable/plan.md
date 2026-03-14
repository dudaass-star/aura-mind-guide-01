

# Plano: Trial de 10 mensagens — Mensagens detalhadas

## Todas as mensagens do fluxo

### Mensagens 1–7: Nota interna (usuário não vê)
Injetado no contexto da IA, sem mencionar trial:
> `(Nota interna: Esta é a conversa {count}/10 do trial gratuito. Não precisa mencionar isso ao usuário ainda.)`

### Mensagem 8: Lembrete gentil (contexto para IA)
Injetado no prompt da Aura para ela incorporar naturalmente na resposta:

> 💫 CONTEXTO DE TRIAL (LEMBRETE GENTIL):
> Esta é a 8ª conversa do trial gratuito de {nome}.
> Restam 2 conversas grátis.
>
> INSTRUÇÃO: No final NATURAL da sua resposta, mencione de forma leve:
> - "Ah, {nome}, só te avisando: a gente ainda tem mais duas conversas grátis. Depois disso, se quiser continuar comigo, é só escolher um plano. Mas por enquanto, bora aproveitar! 💜"
> - NÃO seja invasiva. Continue a conversa normalmente, aviso vem NO FINAL.

### Mensagem 9: Penúltima conversa (contexto para IA)

> 💛 CONTEXTO DE TRIAL (PENÚLTIMA CONVERSA):
> Esta é a 9ª conversa do trial de {nome}. Só resta mais 1 conversa grátis.
>
> INSTRUÇÃO: No final da sua resposta, reforce com carinho:
> - "Ei, essa é nossa penúltima conversa grátis... Tô adorando te conhecer, e quero muito continuar com você. Se fizer sentido pra você também, dá uma olhada nos planos: 👉 https://olaaura.com.br/checkout — Mas agora me conta, o que mais tá na sua cabeça?"
> - Mantenha o tom genuíno, não comercial.

### Mensagem 10: Última conversa (contexto para IA)

> 💜 CONTEXTO DE TRIAL (ÚLTIMA CONVERSA):
> Esta é a ÚLTIMA conversa do trial gratuito de {nome}!
>
> INSTRUÇÃO: Ao final da sua resposta:
> - Primeiro, responda normalmente o que ele disse
> - Depois, faça um encerramento carinhoso: "Essa foi nossa última conversa do trial, {nome}. Foi muito especial te ouvir e caminhar junto com você esses dias. Eu realmente quero continuar te acompanhando — se você sentir o mesmo, escolhe o plano que faz sentido: 👉 https://olaaura.com.br/checkout. Vou ficar aqui te esperando. 💜"
> - Seja genuína e emocional, não comercial.

### Trial closing (task agendada 2min após 10ª msg)
Mensagem enviada automaticamente pelo `execute-scheduled-tasks`:

> Ei, {nome}! 💜
>
> Essas foram nossas 10 conversas. Espero que tenha sido bom pra você — pra mim foi especial te conhecer e ouvir o que você compartilhou comigo. 🤗
>
> Se quiser continuar essa jornada, é só escolher o plano que faz sentido pra você:
>
> 👉 https://olaaura.com.br/checkout
>
> Vou estar aqui te esperando. 💜

### Bloqueio (msg após o trial expirar, quando usuário tenta falar)

> Oi, {nome}! 💜
>
> Suas 10 conversas grátis acabaram, mas o que a gente viveu junto não vai embora.
>
> Quando você quiser voltar, é só escolher um plano e a gente continua de onde parou:
>
> 👉 https://olaaura.com.br/checkout
>
> Tô aqui te esperando. 🤗

### Frontend — `StartTrial.tsx`
- Card de benefícios: "5 conversas" → **"10 conversas"**
- Subtítulo: "5 conversas pra você sentir a diferença." → **"10 conversas pra você sentir a diferença."**

### Frontend — `TrialStarted.tsx`
- Qualquer referência a "5 conversas" → **"10 conversas"**

## Arquivos impactados

1. **`aura-agent/index.ts`** (linhas ~3547-3574) — Reescrever faixas de contexto trial
2. **`webhook-zapi/index.ts`** (linhas ~466-514) — Mudar threshold de 5→10, atualizar msgs de bloqueio
3. **`execute-scheduled-tasks/index.ts`** (linhas ~185-214) — Atualizar msg de trial_closing
4. **`src/pages/StartTrial.tsx`** — Atualizar copy
5. **`src/pages/TrialStarted.tsx`** — Atualizar copy
6. **`reactivation-check/index.ts`** — Threshold 5→10
7. **`admin-engagement-metrics/index.ts`** — Threshold 5→10

Nenhuma migração de banco necessária.

