

## Plano: Nudges neutros de gênero + Resumo de sessão no CTA de trial

### Problema 1: "juntas" no feminino

A palavra "juntas" aparece em vários pontos dos nudges de trial e em outras mensagens. Se o usuário for homem, isso soa estranho. Precisa trocar por linguagem neutra em gênero.

**Locais afetados:**

| Arquivo | Texto atual | Correção |
|---------|------------|----------|
| `aura-agent/index.ts` (linha 3571) | "continuar juntas por menos de R$1" | "continuar caminhando junto por menos de R$1" |
| `aura-agent/index.ts` (linha 4839) | "que bom que estivemos juntas" | "que bom que estivemos aqui" |
| `webhook-zapi/index.ts` (linha 501) | "Nossa primeira jornada juntas" | "Nossa primeira jornada foi muito especial" |
| `stripe-webhook/index.ts` (linha 410) | "continuar nossa jornada juntas" | "continuar nossa jornada" |
| `scheduled-followup/index.ts` (linha 93) | "vamos replanejar juntas" | "vamos replanejar" |
| `schedule-setup-reminder/index.ts` (linha 197) | "organize nossa agenda juntas" | "organize nossa agenda" |
| `aura-agent/index.ts` (várias) | "juntas" em contextos de sessão | Trocar por formas neutras |

A Aura é feminina, mas o interlocutor pode ser de qualquer gênero. A solução é usar construções que não dependam de concordância: "a gente pode continuar caminhando" em vez de "continuar juntas".

### Problema 2: Resumo tipo sessão no CTA de trial

Hoje, quando uma sessão termina, a Aura faz um fechamento com `[INSIGHT:]` e `[COMPROMISSO:]` — um resumo do que foi trabalhado. O CTA do trial (nudge pós-Aha e bloqueio na msg 50) **não faz isso**. A ideia é que, no momento do nudge com link (Aha+4 ou fallback 48) e no bloqueio final (msg 50), a Aura faça um mini-resumo da jornada antes do CTA.

**Mudanças no `aura-agent/index.ts`:**

1. **Nudge com link (Aha+4, linha ~3574)** — Adicionar instrução para a Aura fazer um breve resumo do que foi trabalhado na conversa antes do CTA. Algo como: "Faça um mini-resumo do que vocês trabalharam (2-3 frases) e depois inclua o nudge com link."

2. **Fallback msg 48 (linha ~3594)** — Mesmo padrão: mini-resumo + CTA.

3. **Última conversa msg 50 (linha ~3555)** — Já tem instrução de despedida emocional. Adicionar: "Inclua um resumo breve dos principais momentos da conversa antes da despedida."

4. **Nudge suave (Aha+2, linha ~3566)** — Este NÃO precisa de resumo, é só um toque carinhoso.

### Resumo das mudanças

1. **`aura-agent/index.ts`** — Corrigir "juntas" para neutro em ~5 pontos. Adicionar instrução de mini-resumo nos nudges com link (Aha+4, fallback 48, e bloqueio msg 50).

2. **`webhook-zapi/index.ts`** — Corrigir "juntas" na mensagem de bloqueio (linha 501).

3. **`stripe-webhook/index.ts`** — Corrigir "juntas" na reativação (linha 410).

4. **`scheduled-followup/index.ts`** — Corrigir "juntas" (linha 93).

5. **`schedule-setup-reminder/index.ts`** — Corrigir "juntas" (linha 197).

6. **`execute-scheduled-tasks/index.ts`** — Verificar e corrigir textos de follow-up com "juntas".

