

## Plano: Impedir repetição de meditação após envio recente

### Análise das observações do usuário

Concordo com ambas:

1. **Camada 2 — usar `user_meditation_history`** em vez de texto nas mensagens. A tabela `user_meditation_history` já recebe um insert pelo `send-meditation` (linha 174 do send-meditation). É o marcador mais confiável — não depende de texto frágil. Não precisa de nova coluna nem tabela.

2. **Camada 1 — adicionar exemplo concreto** do comportamento errado vs certo. Melhora o treinamento do modelo.

### Edições

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Bloco 1 — Prompt (após linha 720):** Inserir regra + exemplos:

```
**NUNCA REPETIR MEDITAÇÃO:**
- Se uma meditação já foi enviada nesta conversa (visível no histórico), NÃO inclua [MEDITACAO:...] novamente
- Quando o usuário responder "ok", "sim", "gostei", "amei" após receber uma meditação, continue a conversa SEM re-disparar a tag
- A tag [MEDITACAO:...] deve aparecer NO MÁXIMO UMA VEZ por tema de meditação na conversa

ERRADO: usuário diz "Ok" → Aura inclui [MEDITACAO:respiracao] de novo
CERTO:  usuário diz "Ok" → Aura: "Que bom! Faz com calma 💜 Me conta como você se sentiu depois. [AGUARDANDO_RESPOSTA]"
```

**Bloco 2 — Código (linha 5414-5443):** Antes de disparar `send-meditation`, consultar `user_meditation_history` para o `user_id` nos últimos 10 minutos. Se existir registro, logar skip e não chamar:

```typescript
const meditationMatch = assistantMessage.match(/\[MEDITACAO:(\w+)\]/i);
if (meditationMatch && (profile?.user_id || userPhone)) {
  const meditationCategory = meditationMatch[1].toLowerCase();
  console.log(`🧘 Meditation tag detected: [MEDITACAO:${meditationCategory}]`);
  
  // Remover a tag da resposta (usuário não deve vê-la)
  assistantMessage = assistantMessage.replace(/\[MEDITACAO:\w+\]/gi, '').trim();
  
  // SAFETY NET: check if meditation was sent recently
  let skipMeditation = false;
  if (profile?.user_id) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sbCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: recentMeditation } = await sbCheck
      .from('user_meditation_history')
      .select('id')
      .eq('user_id', profile.user_id)
      .gte('sent_at', tenMinutesAgo)
      .limit(1);
    
    if (recentMeditation && recentMeditation.length > 0) {
      console.log('⏭️ Meditation already sent in last 10 min, skipping duplicate');
      skipMeditation = true;
    }
  }
  
  if (!skipMeditation) {
    // chamar send-meditation (código existente)
    ...
  }
}
```

**Deploy:** `aura-agent`

