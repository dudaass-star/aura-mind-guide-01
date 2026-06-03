## Diagnóstico

A Aura **já tem** o handler `[PAUSAR_SESSOES data="YYYY-MM-DD"]` em `aura-agent/index.ts` (linhas 7094-7121) que zera `needs_schedule_setup` e grava `sessions_paused_until`. O problema: **o prompt não ensina ela a emitir essa tag**.

No caso do Eduardo (02/06 11:16): pediu pra pular o mês, Aura confirmou verbalmente mas não emitiu tag → `needs_schedule_setup` continuou `true` → no dia seguinte (03/06 14:46) ela voltou: "Como você tem 4 sessões pra usar esse mês...".

A seção `# 📅 CONFIGURAÇÃO DE AGENDA DO MÊS` (linha ~5980) só explica **como criar** a agenda — não cobre recusa/adiamento.

## Mudanças

### 1. `aura-agent/index.ts` — adicionar bloco "PULAR/ADIAR" no prompt de setup mensal

Dentro do `if (profile?.needs_schedule_setup && ...)` (perto da linha 6043), acrescentar guia **sem frases prontas literais** para evitar repetição robótica:

```
## SE O USUÁRIO QUISER PULAR/ADIAR O MÊS:
Sinais: "deixar sem sessões esse mês", "não quero marcar agora", "me chama no mês que vem", "pular esse mês", "depois a gente vê", "tô sem cabeça pra sessão agora".

Postura:
- NÃO insista. NÃO faça upsell. NÃO repita pergunta.
- Você PODE fazer no máximo UMA checagem honesta e curta sobre a motivação (cansaço real vs. esquiva), mas **formule com suas próprias palavras a cada vez — nunca repita uma frase pronta**. Se ele reafirmar, ACEITE de primeira.

Quando ele confirmar que quer pular:
1. Acolha curto e honesto (varie a forma — não use sempre "Beleza, anotado").
2. Confirme verbalmente a data em que você volta a chamar (default: dia 1 do próximo mês; se ele pediu data específica, use ela).
3. **OBRIGATÓRIO: emita a tag [PAUSAR_SESSOES data="YYYY-MM-DD"]** no final da resposta com a data em que deve voltar a oferecer setup.
   - Sem a tag, NADA é gravado — você continua perguntando todo dia e o usuário acha você chata.
4. Mude de assunto naturalmente — siga a conversa sem sessão formal.

Formato da tag: [PAUSAR_SESSOES data="YYYY-MM-DD"] (máximo 90 dias no futuro).
```

**Sem bloco "EXEMPLO DE CONVERSA"** — só o contrato da tag. Evita virar muleta repetida. Mantém a regra anti-eco já existente.

### 2. `mem/features/sessions/pausar-sessoes-tag.md` (novo)

Documentar:
- Tag `[PAUSAR_SESSOES data="YYYY-MM-DD"]` existe no handler desde sempre, mas o prompt não ensinava — corrigido em jun/2026.
- Sem tag = promessa vazia (mesmo bug histórico do `[AGENDAR_SESSAO]` da Larissa, 22/04).
- Default da data: dia 1 do próximo mês. Máximo 90 dias.
- O `schedule-setup-reminder` respeita `sessions_paused_until` automaticamente.
- ⚠️ Prompt **não** inclui frases-exemplo literais — só contrato — pra evitar Aura repetir bordões tipo "é cansaço real ou aquele 'deixa pra depois'?".

### 3. `mem/index.md`

Adicionar 1 linha na seção Memories referenciando o novo arquivo.

## Fora de escopo

- Não mexo no `scheduled-checkin` nem nas guardas de PING-PONG (turno anterior).
- `monthly-schedule-renewal` já zera `sessions_paused_until` no dia 1 — comportamento certo.
- Não crio `[AGENDAR_TAREFA]` paralela — a renovação mensal já cobre.

## Risco

Baixo. Mudança é prompt-only + 1 doc. Handler já existe.
