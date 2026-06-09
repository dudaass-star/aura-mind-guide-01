## O que está acontecendo

A Débora dias (plano Essencial, 46s de áudio usados de 1800s — orçamento sobrando) pediu várias vezes pra Aura responder em voz e continuou recebendo texto:

- "Fala o texto por áudio"
- "Preciso que fale por audio"
- "Preciso que fale por audio e não por texto"
- "Você não consegue conversar por audio?"

Causa: o detector determinístico `userWantsAudio()` em `supabase/functions/aura-agent/index.ts` (linhas 3105-3115) só reconhece frases como "manda um áudio", "em áudio", "mensagem de voz", "fala comigo", "um áudio", "sua voz". Nenhuma das frases da Débora bate — então `wantsAudio=false`, decisão cai em `default_text`, e a Aura responde escrita.

## Mudança

Arquivo único: `supabase/functions/aura-agent/index.ts`, função `userWantsAudio()`.

Substituir a lista atual por uma combinação de:

1. **Lista expandida de frases** (manter as atuais + adicionar): "por áudio", "por audio", "no áudio", "no audio", "em voz", "responde em áudio", "responde em audio", "fala pra mim", "me fala".
2. **Regex de cobertura** para variações naturais:
   ```
   /(fala|fale|responde|responder|respondendo|conversa|conversar|manda|mande|mandando)\s+(em|por|no|na|de)\s+(á?udio|voz)/i
   ```
   Pega "fale por áudio", "responde no audio", "conversar em voz", "me manda em áudio", etc.

Prioridade segue: `userWantsText` é avaliado primeiro (já está), então quem pede "só texto" / "sem áudio" continua sendo respeitado. "não por texto" não dispara `userWantsText` (lista atual não cobre essa frase) — fica como está.

## Validação

1. Após eu salvar, o deploy do `aura-agent` roda via GitHub Actions. Se houver drift, redeployo manualmente.
2. Em 5 min: checar `failed_message_log` por erro novo.
3. Quando a Débora repetir "fala por áudio", os logs devem mostrar `🎙️ Audio control: { decision: 'user_requested', mandatory: false, ... }` e a resposta sai em voz.

## Fora de escopo

- Não vou adicionar classifier LLM por turno (custo recorrente sem necessidade).
- Não vou criar campo `audio_preference` persistente no profile agora — fica como evolução separada se virar dor recorrente.
- Não mexo no orçamento mensal de áudio do Essencial nem no fluxo de sessões.
