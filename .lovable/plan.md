## Plano final v7 — correção dos bugs do funil D0

Incorpora: varredura de tags em **todas** as edge functions (não só `aura-agent`) e expansão da whitelist com tags consumidas por workers.

### Causa-raiz confirmada
Em `aura-agent/index.ts` há **dois** blocos que injetam prompt de setup mensal:

| Linha | Bloco | Guard `!pending_first_session_invite`? |
|---|---|---|
| 5888 | "📅 CONFIGURAÇÃO DE AGENDA DO MÊS" | ✅ Sim |
| 7113 | "🆕 USUÁRIO NOVO" item 3 | ❌ **Não** — bug |

No D0, o convite D0 (linha 5762) e o item 3 do bloco USUÁRIO NOVO colidem. A Aura pergunta sobre setup mensal e às vezes emite `[CRIAR_AGENDA:...]`, criando 4 sessões fantasma sem realizar a 1ª D0.

### Fixes

#### Fix 1 — Adicionar guard D0 ao bloco USUÁRIO NOVO (`aura-agent/index.ts:7113`)
```ts
3. ${planConfig.sessions > 0 && profile?.needs_schedule_setup && !profile?.pending_first_session_invite
   ? `Após 3-4 trocas de acolhimento, mencione NATURALMENTE as sessões: ...`
   : 'Continue conhecendo o usuário e sua situação de vida.'}
```

#### Fix 2 — Reforçar prompt do convite D0 (linhas 5782-5808)
- "Esta é a 1ª sessão. NÃO pergunte sobre dias da semana ou horários recorrentes neste turno."
- "NUNCA emita `[CRIAR_AGENDA:...]` — essa tag é só de setup mensal e vem DEPOIS desta sessão acontecer."
- "A única tag aceita aqui é `[AGENDAR_SESSAO:YYYY-MM-DD HH:MM]`."

#### Fix 3 — Safety Net D0 com critérios temporais estritos (`schedule-tag-extractor/index.ts`)
Em `SAFETY_NET_SYSTEM_PROMPT`, `confirmed=true` apenas quando TODAS:
1. Frase ativa **na resposta atual da Aura** ("vou marcar", "vou abrir agora", "começar nossa primeira sessão", "nossos 45 minutos") — não em turnos anteriores.
2. Aceite do usuário **no turno imediatamente anterior** ("sim", "bora", "pode marcar", "vamos").
3. Frases ambíguas ("deixei salvo", "travar no calendário") só contam quando há **horário/número concreto** explícito na mesma resposta.

Regra de ouro mantida: dúvida → false; pergunta da Aura → false.

#### Fix 4 — Log de tags inventadas (whitelist + fire-and-forget)

O strip já existe na linha 81 (catch-all em `stripAllInternalTags`) — Fix 4 é puramente **observabilidade**.

**Etapa 1 obrigatória — varredura em TODAS as functions, não só aura-agent:**
```bash
rg -no '\[[A-Z][A-Z_]+(?::[^\]]+)?\]' supabase/functions/ | sort -u
```
Cruzar resultado com a whitelist. Inclui: `aura-agent`, `process-webhook-message`, `schedule-tag-extractor`, `session-reminder`, `execute-scheduled-tasks`, `choose-next-journey` e qualquer outro consumidor.

**Whitelist canônica** (já refletindo varredura — declarada no topo do `aura-agent/index.ts`):
```ts
const VALID_AURA_TAGS = [
  // tags de saída da Aura — controle conversacional
  'MODO_AUDIO','AGUARDANDO_RESPOSTA','CONVERSA_CONCLUIDA',
  'ENCERRAR_SESSAO','INICIAR_SESSAO','REATIVAR_SESSAO','VALOR_ENTREGUE',
  // tags de sessão
  'AGENDAR_SESSAO','REAGENDAR_SESSAO','SESSAO_PERDIDA_RECUSADA',
  'SESSION_PREARM','SESSION_START',
  // tags de tema
  'TEMA_NOVO','TEMA_RESOLVIDO','TEMA_PROGREDINDO','TEMA_ESTAGNADO',
  // tags de compromisso
  'COMPROMISSO','COMPROMISSO_CUMPRIDO','COMPROMISSO_ABANDONADO',
  'COMPROMISSO_RENEGOCIADO','COMPROMISSO_LIVRE',
  // tags de jornada/conteúdo (consumidas por process-webhook-message)
  'LISTAR_JORNADAS','TROCAR_JORNADA','PAUSAR_JORNADAS',
  'CONTENT','WEEKLY_REPORT','WELCOME','AURA',
  // tags de tarefas/automação
  'NAO_PERTURBE','PAUSAR_SESSOES','AGENDAR_TAREFA','CANCELAR_TAREFA',
  // tags de feature
  'CAPSULA_DO_TEMPO','MEDITACAO','UPGRADE','UPGRADE_REFUSED',
  'INSIGHT','INSIGHTS','CRIAR_AGENDA','MARCO',
];
```

**Validação pré-deploy:**
1. Varredura completa (etapa 1 acima) — qualquer tag fora da whitelist precisa ser revisada.
2. Rodar a regex contra os últimos 200 turnos da Aura em `messages` (read-only) — zero falso positivo na amostra.

**Detector fire-and-forget (fora do caminho crítico):**
```ts
const allTags = response.match(/\[([A-Z_]+)(?::[^\]]+)?\]/g) || [];
const unknown = allTags.filter(t => !VALID_AURA_TAGS.some(v => t.startsWith(`[${v}`)));
if (unknown.length) {
  // fire-and-forget — NUNCA bloqueia entrega
  supabase.from('failed_message_log').insert({
    error_type: 'unknown_tag_invented',
    payload: { tags: unknown, user_id: profile?.user_id, response_excerpt: response.slice(0, 500) }
  })
    .then(() => console.warn('🚨 Tags inventadas logadas:', unknown))
    .catch((e) => console.error('Falha ao logar tags inventadas (não bloqueia):', e));
}
// strip continua via stripAllInternalTags (catch-all linha 81)
```

**Pós-deploy — guarda contra ruído:** se `unknown_tag_invented` ultrapassar >50/dia nos primeiros 7 dias, revisar a whitelist antes de tratar como bug — provavelmente alguma tag legítima ficou de fora.

### Ordem de execução
1. Varredura `rg -no '\[[A-Z][A-Z_]+(?::[^\]]+)?\]' supabase/functions/` cobrindo **todas** as functions + validação contra 200 turnos recentes.
2. Aplicar Fix 1, 2, 4 em `aura-agent/index.ts`.
3. Aplicar Fix 3 em `schedule-tag-extractor/index.ts`.
4. Deploy via `supabase--deploy_edge_functions(["aura-agent","schedule-tag-extractor"])`.
5. Monitor: 5 min → `failed_message_log` sem erros novos no fluxo D0; 24h → `unknown_tag_invented` calibrado e taxa de re-confirmação Safety Net.

### Memória a atualizar
- `mem://features/sessions/first-session-invite-d0` — guard D0 precisa estar nos **dois** blocos (5888 e 7113).
- `mem://features/sessions/safety-net-d0` — critérios temporais estritos.
- `mem://technical/ai/output-tag-validation` (nova) — `VALID_AURA_TAGS` é fonte de verdade; varredura deve cobrir **toda** `supabase/functions/`; log é fire-and-forget; strip já é catch-all na linha 81.

### Arquivos
- `supabase/functions/aura-agent/index.ts` — Fix 1, 2, 4.
- `supabase/functions/schedule-tag-extractor/index.ts` — Fix 3.
- Sem migração de schema. Sem recovery dos 5 D0.
