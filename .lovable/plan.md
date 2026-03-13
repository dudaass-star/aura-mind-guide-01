

# Sistema de Orçamento Mensal de Áudio — Plano Simplificado

## O que muda vs. plano anterior

O plano anterior criava novas instruções de áudio no prompt (substituindo TIPO 1/TIPO 2). **Isso não é necessário.** O prompt atual já orienta a IA sobre quando usar `[MODO_AUDIO]`. A única mudança real é:

1. **O código para de REMOVER a tag `[MODO_AUDIO]`** quando a IA a inclui — desde que tenha orçamento
2. **Abertura de sessão** permanece obrigatória (já existe como `forceAudioForSessionStart`)
3. **Contador mensal** limita o total de áudio por mês

## Sobre a duração dos áudios

A API do Google Cloud TTS **não retorna a duração** do áudio gerado. O `aura-tts` retorna apenas bytes em base64. Para medir a duração real, seria preciso decodificar o MP3, o que é complexo.

**Solução prática:** estimar com `Math.ceil(texto.length / 15)` segundos (~15 chars/s em pt-BR). É uma aproximação, mas com orçamentos generosos (30-120 min), a margem de erro é irrelevante.

## Mudanças

### 1. Migração SQL — `profiles`

Adicionar 2 colunas:
- `audio_seconds_used_this_month` integer DEFAULT 0
- `audio_reset_date` date DEFAULT NULL

### 2. `aura-agent/index.ts` — Linha ~4851

Substituir:
```text
const allowAudioThisTurn = !wantsText && (wantsAudio || crisis || forceAudioForSessionStart || forceAudioForSessionClose);
```

Por:
```text
const aiWantsAudio = assistantMessage.trimStart().startsWith('[MODO_AUDIO]');
const budgetSeconds = profile?.plan === 'transformacao' ? 7200 : profile?.plan === 'direcao' ? 3000 : 1800;
const audioSecondsUsed = profile?.audio_seconds_used_this_month || 0;

// Reset inline se mês mudou
const currentMonth = new Date().toISOString().slice(0, 7);
const resetMonth = profile?.audio_reset_date?.slice(0, 7);
const budgetAvailable = (currentMonth !== resetMonth) || (audioSecondsUsed < budgetSeconds);

const allowAudioThisTurn = !wantsText && (
  crisis ||                         // segurança: sempre
  wantsAudio ||                     // usuário pediu
  forceAudioForSessionStart ||      // OBRIGATÓRIO: abertura de sessão
  forceAudioForSessionClose ||      // encerramento
  (aiWantsAudio && budgetAvailable) // IA decidiu + tem orçamento
);
```

**Nenhuma mudança no prompt.** As instruções de áudio existentes continuam como estão.

### 3. `aura-agent/index.ts` — Após envio de áudio

Depois de enviar o áudio com sucesso, incrementar o contador:
```text
estimatedSeconds = Math.ceil(textoDoAudio.length / 15)
UPDATE profiles SET
  audio_seconds_used_this_month = audio_seconds_used_this_month + estimatedSeconds,
  audio_reset_date = CURRENT_DATE
WHERE user_id = ...
```

Se o mês mudou em relação ao `audio_reset_date`, resetar para 0 + estimatedSeconds.

### 4. `aura-agent/index.ts` — Auto-inject `[AGUARDANDO_RESPOSTA]`

Após geração da resposta: se contém `?` mas não tem tag de status, adicionar `[AGUARDANDO_RESPOSTA]`.

### 5. `monthly-schedule-renewal/index.ts`

Adicionar ao update existente:
```text
audio_seconds_used_this_month: 0,
audio_reset_date: today
```

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migração SQL (nova) | 2 colunas em `profiles` |
| `supabase/functions/aura-agent/index.ts` | Fórmula `allowAudioThisTurn` + contador pós-envio + auto-inject tag |
| `supabase/functions/monthly-schedule-renewal/index.ts` | Reset do contador |

## Resumo

- **Prompt de áudio**: sem alteração (a IA já sabe quando usar `[MODO_AUDIO]`)
- **Código**: para de remover `[MODO_AUDIO]` quando a IA inclui e tem orçamento
- **Abertura de sessão**: obrigatória (já existe)
- **Duração**: estimada por caracteres (~15 chars/s), não lida do MP3
- **Orçamentos**: Essencial=1800s, Direção=3000s, Transformação=7200s

