# Redesign V2 — Restante do Portal (Deep Navy Anchor)

A aba **Hoje** e a navegação já foram reestilizadas. Este plano fecha as 4 abas restantes com os mesmos tokens visuais e limpa o lixo técnico que ainda vaza dos dados.

## Tokens (locked)
- Bg: `#F5F0E8` (creme) · Superfícies: `white/60`
- Navy `#1B2A4E` (títulos, CTA principal, hero cards)
- Sage `#87A878` (labels, chips, acentos secundários)
- Lavender `#B8A5D9` (hero de insight, novidade dots)
- Fraunces para display/quotes · Nunito para UI/body

## Escopo por aba

### 1. Percurso (`InsightsTab.tsx`) — Capítulos mensais
- Card de mês em bg `white/60` com borda sage/15, título em Fraunces navy, mês em label sage uppercase.
- Citação literal em blockquote Fraunces italic navy, com barra lateral lavender.
- Estado vazio: card creme com mensagem clara (evita fallback genérico).
- Aplicar `sanitizePortalText` em toda síntese e citação.

### 2. Sobre você (`SobreVoceTab.tsx`) — Retrato + prompts
- Bloco "Retrato" como hero navy (igual próxima sessão), com nome em Fraunces XL e descrição em Nunito.
- Os 6 prompts temáticos (Medos, Objetivos, Desafios…) viram chips com bg `white/60`, ícone sage, label Fraunces.
- CRUD dos insights do usuário: cards `white/60`, botão adicionar em navy pill.
- Sanitizar `content` de cada insight na exibição.

### 3. Meditações (`MeditacoesTab.tsx`)
- Grid de cards `white/60` com borda sage/15, título Fraunces navy, duração em label sage.
- Player mantém funcionalidade; só troca cores (barra em gradient sage→lavender, botão play navy).
- Categoria destacada como chip sage claro.

### 4. Sessões (`SessoesTab.tsx`)
- Próxima sessão como hero navy (mesmo componente visual do Hoje).
- Histórico: lista de cards `white/60` com data em label sage, tema em Fraunces navy, síntese em Nunito.
- Sanitizar `session_summary` e `closure_text`.

## Sanitização (transversal)
Aplicar `sanitizePortalText` (já criado) em qualquer string vinda do banco em:
- InsightsTab (síntese, citações)
- SobreVoceTab (portrait_text, insight.content)
- SessoesTab (session_summary, closure_text)
- MonthlyLetters se exibidas em qualquer aba

## Fora de escopo
- Backend, edge functions, schema: nenhuma mudança.
- Lógica de negócio (níveis de intimidade, queries): mantém.
- Aba Hoje e navegação: já feitas — não tocar.

## Verificação
- Playwright no perfil Eduardo capturando as 4 abas após o build.
- Conferir: sem `[CONTENT]`, sem `**markdown**`, sem URLs cruas visíveis.
