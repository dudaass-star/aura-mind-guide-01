# Portal como destino — plano enxuto

Escopo pós-cortes: **Badges de novidade + Pergunta do dia + Ações rápidas + Timeline (substitui Insights)**. Sem share público, sem notificação mensal extra, sem streak de semanas.

## 1. Badges de novidade nas abas

Marca visual (ponto colorido) ao lado do nome da aba quando há conteúdo novo desde a última visita do usuário:

- **Hoje**: nova sessão concluída ou insight recém-recebido.
- **Timeline** (ex-Insights): nova carta mensal, novo snapshot temático, ou novo insight.
- **Jornada**: novo snapshot mensal gerado.
- **Memória**: nada — não faz sentido "novidade" aqui.

Como funciona:

- Novo campo `profile.portal_tab_seen_at jsonb` guarda `{ hoje: iso, timeline: iso, jornada: iso }`.
- Cada aba grava seu `seen_at` ao abrir.
- Badge aparece se o `max(created_at)` do conteúdo da aba for maior que o `seen_at`.
- Visual: bolinha 6px em `bg-accent`, sem número, sem texto — sóbrio.

## 2. Pergunta do dia na aba "Hoje"

Card acima dos cards existentes:

- Uma pergunta curta trocada a cada dia (rotação determinística por `dayKey`, mesma lógica da meditação sugerida).
- Botão único: **"Responder com a Aura"** → abre WhatsApp com a pergunta pré-preenchida como se o usuário estivesse trazendo o tema.
- Fonte: array curado no código (~30 perguntas), sem cron, sem tabela. Ex:
  - "Uma coisa que ficou difícil/pesada essa semana?"
  - "O que você tá evitando confrontar?"
  - "Tem algo que você adiaria hoje se pudesse?"
- Se o usuário já conversou nas últimas 12h, o card some (evita empurrar quando já tá em conversa).

Objetivo: ritual leve que dá razão pra abrir o portal fora dos dias de carta/snapshot.

## 3. Ações rápidas contextuais na "Hoje"

Barra horizontal de 4 chips clicáveis abaixo da saudação:

- **Marcar sessão** → WhatsApp: "Oi Aura, quero marcar uma sessão."
- **Reagendar** → WhatsApp: "Oi Aura, preciso reagendar."
- **Pausar sessão 7 dias** → WhatsApp: "Oi Aura, quero pausar a sessão por uma semana."
- **Me chama amanhã** → WhatsApp: "Oi Aura, me manda mensagem amanhã de manhã?"

Cada chip usa `auraWhatsAppLink()` existente. Visual: pill compacto, ícone + texto curto, não competindo com os cards principais.

## 4. Timeline substitui a aba Insights

Aba renomeada para **"Percurso"** (mais evocativo que "Insights"). Continua com o mesmo id `insights` internamente pra não quebrar links existentes.

Conteúdo: **linha do tempo cronológica reversa** que funde 4 fontes numa lista única:

- Sessões concluídas (com `closure_text` como preview)
- Snapshots temáticos mensais (título + evidência)
- Cartas mensais (título + trecho)
- Insights avulsos (`user_insights` marcados como `important` ou `pending_insight` histórico)

Cada item da timeline tem:

- Data legível ("15 de março", "há 3 dias")
- Ícone por tipo (Calendar / Route / Mail / Sparkles)
- Título curto
- 1-2 linhas de preview
- Tap → expande in-place com o conteúdo completo

Agrupamento por mês (header sticky "Março 2026").

Empty state: se nenhuma fonte tem conteúdo, mostra mensagem convidando a primeira sessão (como o `hasAnything` da Hoje).

## Ordem de execução

1. **Badges de novidade** — 1 migração pequena (`profile.portal_tab_seen_at`) + hook em cada aba.
2. **Pergunta do dia** — só frontend, array + rotação determinística.
3. **Ações rápidas** — só frontend, chips com `auraWhatsAppLink`.
4. **Timeline (Percurso)** — reescreve `InsightsTab.tsx` unificando as 4 fontes; renomeia label da aba mantendo id.

## Arquivos afetados

- Migration: adicionar `portal_tab_seen_at jsonb` em `profiles`.
- `src/pages/UserPortal.tsx`: label da aba `insights` vira "Percurso"; badges no map de tabs.
- `src/components/portal/HojeTab.tsx`: adicionar `PerguntaDoDiaCard` e `AcoesRapidasBar`.
- `src/components/portal/InsightsTab.tsx`: reescrita como Timeline.
- Novo hook `usePortalNovidades(userId)` que retorna `{ hoje: bool, timeline: bool, jornada: bool }`.

## Métrica pra medir

Log `portal_view` numa tabela simples ou reusar `checkins`. Meta: usuário ativo abrindo portal ≥2× por mês (baseline atual ~1×).

## Fora de escopo (confirmado)

- Compartilhável privado (risco de sinal errado num produto clínico).
- Notificação mensal extra (redundante com carta).
- Streak de semanas (fraco e culpabilizante).