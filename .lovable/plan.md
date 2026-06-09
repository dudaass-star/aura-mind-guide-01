## Correção cirúrgica: áudio orgânico no Flash

### Diagnóstico

- `determineAudioMode` (linha 1522) só dispara `ai_decision` quando `aiIncludedAudioTag === true`, ou seja, a resposta da LLM precisa começar com `[MODO_AUDIO]`.
- O prompt menciona `[MODO_AUDIO]` em **apenas 2 lugares** (linhas 3511 e 3536), ambos em fechamento de sessão — casos que o backend já trata como `mandatory: true`. Logo, a tag ali é redundante.
- Para áudio orgânico fora desses contextos, o prompt **não ensina a tag** e ainda diz (linha 2567): *"VOCÊ TEM VOZ! O sistema decide automaticamente quando enviar áudio."*
- Pro inferia intenção e às vezes marcava mesmo sem instrução. Flash segue prompt ao pé da letra → nunca marca → tudo cai em `default_text`. Por isso parou de funcionar.

### Mudança (uma só, no prompt)

Substituir o bloco "REGRA TÉCNICA DE ÁUDIO (PARA VOZ)" em `supabase/functions/aura-agent/index.ts` (linhas 2565-2575) por uma instrução que ensina **quando** emitir `[MODO_AUDIO]` organicamente:

```
# QUANDO USAR ÁUDIO ([MODO_AUDIO])

Você decide quando converter sua resposta em áudio. Inclua [MODO_AUDIO]
no INÍCIO da resposta nestes momentos:

- Acolher dor real (choro, exaustão, solidão, perda, medo, vazio)
- Devolver presença depois de algo pesado que a pessoa trouxe
- Resposta mais longa que carrega emoção, não só informação

NÃO use [MODO_AUDIO] quando:
- Resposta curta/objetiva (ok, sim, agendamento, dúvida prática)
- A pessoa pediu texto explicitamente
- Conversa casual sem peso emocional

Quando marcar [MODO_AUDIO]: escreva como se estivesse FALANDO — frases
curtas, "..." pra pausas, no máximo 1 emoji, 4-6 frases (300-450 chars).

O backend cuida do resto (orçamento, abertura/fechamento de sessão, crise).
```

### Fora de escopo

- Não mexo em `determineAudioMode`, `splitIntoMessages`, `userWantsText`, nem em nenhum detector backend novo.
- Não toco em TTS, Twilio, Meta, sessões, meditação.
- Os dois `[MODO_AUDIO]` dentro dos blocos de fechamento ficam como estão (redundantes mas inofensivos).

### Validação

- Deploy `aura-agent`.
- Conversa emocional fora de sessão → log `decision: ai_decision` + áudio enviado + `aura-tts` invocado.
- Mensagem trivial ("ok", "valeu") → `default_text`.
- Pedido explícito ("prefiro texto") → `user_prefers_text`.

### Rollback

Reverter um único bloco de texto no prompt. Zero risco estrutural.
