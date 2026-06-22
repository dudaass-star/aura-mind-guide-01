# Áudio TTS: trocar pra Flash + novos limites + regra áudio↔áudio (piloto Débora)

## Decisões fechadas

1. **Trocar TTS de Pro → Flash** (`google/gemini-2.5-flash-tts`). Corta custo pela metade. Qualidade da voz cai um pouquinho mas continua natural — aceitável.
2. **Novos limites por plano:**
   - Essencial: **30 min** (mantém)
   - Direção: **50 → 90 min** (+40 min)
   - Transformação: **120 → 180 min** (+60 min)
3. **Regra "áudio entra → áudio sai": ligar SÓ pra Débora primeiro** (piloto 2 semanas), medir consumo real, depois decidir se promove pra global. Minha sugestão.

## Projeção de custo com Flash (R$ 5,80/USD)

| Plano | Min/mês | Custo TTS/mês |
|---|---|---|
| Essencial | 30 | **R$ 3,40** |
| Direção | 90 | **R$ 10** |
| Transformação | 180 | **R$ 20** |

Margem confortável em todos os tiers.

## Mudanças técnicas

### 1. Trocar modelo TTS pra Flash
- `system_config.tts_model`: `google/erinome` → `google/erinome-flash` (ou criar nova entrada).
- `aura-tts/index.ts` linha 106: `modelName: "gemini-2.5-pro-tts"` → `"gemini-2.5-flash-tts"`.
- Log model name atualizado (linha 299): `'google/gemini-2.5-flash-tts'`.
- **Validar voz**: Erinome existe no Flash? Se não, escolher voz equivalente (ex.: Aoede, Despina) e testar 2-3 áudios antes de promover.

### 2. Atualizar limites por plano
- `aura-agent/index.ts` linha 7570:
  ```ts
  const budgetSeconds = profile?.plan === 'transformacao' ? 10800   // 180 min
                      : profile?.plan === 'direcao'      ? 5400    // 90 min
                                                         : 1800;   // 30 min Essencial
  ```
- Atualizar mensagens de teto estourado pra refletir novos limites.
- Atualizar memória `sistema-orcamento-mensal` com novos valores.

### 3. Flag "áudio↔áudio" individual (piloto Débora)
- Migration: adicionar coluna `audio_mirror_enabled BOOLEAN DEFAULT FALSE` em `profiles`.
- Ativar `true` pra Débora (`id = 53b5f75d-f0b2-41fd-a0da-74e1b3ab08f1`).
- No `aura-agent`, antes de decidir áudio (lógica do `audioDecision`):
  ```ts
  if (profile.audio_mirror_enabled && lastUserMessageWasAudio) {
    audioDecision.mandatory = true;
    audioDecision.reason = 'audio_mirror_flag';
  }
  ```
- Respeita o teto mensal normalmente — se estourar, volta a texto com aviso ("seu pacote de áudio acabou, volto em áudio dia DD/MM").

### 4. Comunicação Débora
- Mandar WhatsApp explicando: "ativei pra você responder em áudio sempre que você mandar áudio, dentro do seu pacote mensal de 30 min. Se quiser mais espaço, posso te explicar os planos Direção (90 min) ou Transformação (180 min)."

## Métricas pra avaliar piloto (2 semanas)

- Minutos consumidos/dia por Débora.
- % de áudios da Aura que estouraram o teto e caíram pra texto.
- Custo real TTS observado em `token_usage_logs`.
- Sentimento da Débora (engagement, feedback espontâneo).

Se métricas saudáveis → promover regra global numa segunda fase (adicionar `audio_mirror_enabled = true` no default ou hardcode na lógica).

## O que NÃO entra agora

- Add-on pago de áudio (avaliar depois do piloto, se demanda surgir de outros).
- Plano "Áudio Ilimitado" novo (mesmo motivo).
- Migração das meditações guiadas pra Flash (escopo separado, Inworld continua).
