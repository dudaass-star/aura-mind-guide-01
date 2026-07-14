
## Objetivo

Deixar o portal legível no mobile (sem overflow), sem redundâncias, com empty states honestos e ações rápidas que fazem sentido para cada momento do usuário.

---

## 1. Consolidar 8 → 6 tabs

Estrutura final da barra:

```
Hoje · Sessões · Percurso · Memória · Sobre você · Meditações
```

- **Remover a aba "Jornada"** (snapshots temáticos mensais). Os snapshots passam a aparecer **dentro do feed "Percurso"** como cards especiais (marco mensal), mantendo a produção pelo cron intacta.
- **Remover a aba "Jornadas" antiga** (percurso 60 dias com bug de hooks). O Percurso novo já cobre a mesma promessa de linha do tempo.
- Ganho: cabe em mobile 390px sem scroll horizontal, sem tabs cortadas.

## 2. Ações rápidas — trocar "Pausar 7 dias" por reagendamento

No `AcoesRapidasBar`:

- **Manter**: "Marcar sessão".
- **Reformular "Reagendar"** para virar o botão principal com **três opções** (popover ou sheet):
  - Reagendar para daqui a **7 dias**
  - Reagendar para daqui a **14 dias**
  - Reagendar para daqui a **30 dias**
- **Remover** "Pausar 7 dias" (era ambíguo: parecia silenciar a Aura em vez de mover a sessão).
- **Manter** "Me chama amanhã".
- Condicional: "Reagendar" só aparece se existe **próxima sessão marcada**. Sem sessão, mostra apenas "Marcar sessão" + "Me chama amanhã".

Cada opção dispara uma mensagem pré-formatada para a Aura via WhatsApp (ex.: "Quero remarcar minha próxima sessão para daqui a 14 dias"), no mesmo padrão dos outros CTAs do portal — sem editar sessão direto no banco.

## 3. Empty state real no "Hoje" para user zero-conversa

Se `messages_count === 0`:
- Esconder Pergunta do Dia, Meditação sugerida e Ações rápidas.
- Mostrar **um único card grande**: "Fala com a Aura pela primeira vez" + botão "Abrir WhatsApp".
- Manter a saudação e o IntimacyLevel acima (que já indica "começando").

## 4. IntimacyLevel com label textual

Adicionar linha de texto acima da barra:
```
Aura te conhece: superficialmente
```
Muda conforme o estágio (`superficialmente` / `bem` / `profundamente`). Tooltip continua para detalhes extras.

## 5. Fallback do "Sobre você"

Se `portrait` não existe **e** `messages_count < 20`:
- Trocar o skeleton "Organizando o que sei sobre você…" por empty state:
  - "A Aura ainda precisa te conhecer melhor. Depois de algumas conversas, seu retrato aparece aqui."
- Mantém skeleton apenas quando portrait está genuinamente em geração (user já tem volume).

## 6. Cleanup

- Remover `JornadaTab.tsx` (aba de snapshots) e sua importação em `UserPortal.tsx`.
- Remover `JornadasTab.tsx` antiga.
- Integrar snapshots como card no `InsightsTab.tsx` (Percurso).
- Deletar `src/pages/UserPortalPreview.tsx` e a rota dev-only em `App.tsx` ao final.

---

## Arquivos afetados

- `src/pages/UserPortal.tsx` — remove 2 tabs, reordena.
- `src/components/portal/InsightsTab.tsx` — inclui snapshots temáticos no feed.
- `src/components/portal/AcoesRapidasBar.tsx` — remove Pausar, reformula Reagendar com 3 opções, torna condicional.
- `src/components/portal/HojeTab.tsx` — empty state zero-conversa.
- `src/components/portal/IntimacyLevel.tsx` — label textual inline.
- `src/components/portal/SobreTab.tsx` (ou equivalente) — fallback de skeleton.
- `src/components/portal/JornadaTab.tsx` — deletar.
- `src/components/portal/JornadasTab.tsx` — deletar.
- `src/pages/UserPortalPreview.tsx` + `src/App.tsx` — remover rota dev.

Sem migrações de banco. Sem mudanças em edge functions. `thematic_snapshots` continua sendo produzida pelo cron e agora é consumida pelo Percurso.
