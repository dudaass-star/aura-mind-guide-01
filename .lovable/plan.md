## Diagnóstico do estado atual

Olhando o retrato do Eduardo, dá pra separar o que está bom do que ainda destoa do "UAU":

**Bom:** intro narrativa, "O que te move", "Padrões", "Preferências" e "Conquistas" leem como retrato real.

**Problemas concretos:**

1. **Pessoas com lixo semântico**
   - `Mentor: Aura` — a Aura aparecendo como pessoa da vida dele é cringe e quebra a imersão.
   - `Esposa: ficou brava com o débito automático` — evento episódico tratado como descrição de pessoa. A nota deveria ser um traço relacional estável ("parceira de longa data", "com quem ele evita discutir planos"), não fofoca de um dia.

2. **Temas em movimento poluídos e sem espaçamento legível**
   - Entram itens **operacionais/meta** que não são temas de vida: `mudança de assunto`, `recusa de ajuda`, `recusa de agendamento de sessões`, `organizar sessões do mês`. Esses são comportamentos de conversa, não temas terapêuticos.
   - Inconsistência de capitalização: `ansiedade`, `conexão com as filhas` (lowercase) vs `Desejo de mais liberdade`, `Dominando a Ansiedade` (Title Case). Tudo deveria seguir um padrão.
   - Duplicata semântica: `ansiedade · 2` + `Dominando a Ansiedade` (deveriam se fundir).

3. **Padrões com ruído operacional**
   - `Você insiste em áudios em vez de texto e busca soluções como medicação` — mistura preferência de canal (operacional) com tentativa de tratamento. Não é um padrão de vida, é meta-conversa.

4. **Seção "Pontos sensíveis" aparecendo vazia**
   - Mesmo com array vazio, o header aparece (porque o backend está gravando array vazio mas o guard frontend trata `length > 0`). Confirmar no código se está realmente escondendo ou só colapsado sugerindo conteúdo.

5. **Conquistas: separação visual fraca**
   - Os chips estão lendo como bloco contínuo ("AutoconfiançaVocê compreendeu..."). Precisa de mais respiro entre badges e talvez quebra de linha consistente em mobile (390px).

---

## Plano de ajustes

### A) Prompt do `generate-user-portrait` (regras mais duras)

Reforçar no system prompt:

- **Pessoas — banlist explícita:**
  - Nunca incluir `Aura`, `aura`, `mentor`, `terapeuta`, `coach`, `assistente`.
  - Nota de pessoa deve ser um **traço relacional estável** (papel, relação, dinâmica recorrente), nunca um evento isolado ("ficou brava com X", "disse Y ontem"). Se só houver evento episódico, omitir a nota.
  - Se o label é uma pessoa mas não tem nome próprio nem nota relacional válida, **descartar a entrada**.

- **Padrões — escopo de vida, não de conversa:**
  - Excluir padrões sobre o canal/formato da própria conversa com a Aura (áudio vs texto, frequência de uso, preferência de mensagem).
  - Excluir comportamentos do tipo "muda de assunto", "recusa ajuda no chat".

- **Conquistas — frase curta, autônoma e pontuada:**
  - Cada conquista deve ser uma frase completa terminando em ponto (ou sem ponto, mas consistente), max ~80 chars, para o chip não virar parágrafo.

### B) Curadoria de temas no frontend (`SobreVoceTab.tsx`)

Aplicar um filtro local em `dedupedThemes` antes de renderizar:

- **Banlist de temas operacionais** (case-insensitive, regex parcial):
  - `mudança de assunto`, `recusa de agendamento`, `recusa de ajuda`, `organizar sessões`, `agendar sessão`, `cancelar sessão`, `setup mensal`.
- **Normalização de capitalização:** aplicar `toLowerCase()` consistente OU sentence-case para todos (preferência: sentence-case — primeira letra maiúscula, resto natural). Padronizar para que `Desejo de mais liberdade` e `ansiedade` virem `Desejo de mais liberdade` e `Ansiedade`.
- **Dedup semântico leve** (já existe por chave lowercase) — adicionar match por substring inclusiva: se um tema curto (`ansiedade`) está contido em outro (`Dominando a Ansiedade`), somar `session_count` e manter o de maior contagem.

### C) Visual: respiro e legibilidade

- `Conquistas`: aumentar `gap-2` → `gap-2.5`, garantir `max-w-full` no chip e `whitespace-normal` para quebrar texto longo em vez de extrudar. Adicionar `leading-snug`.
- `Temas em movimento`: já tem `flex-wrap gap-2`, mas reforçar `gap-2.5` e `py-2` no chip para dar mais ar; garantir `whitespace-nowrap` no chip individual e wrap só entre chips.
- `Pontos sensíveis`: só renderizar a seção colapsável se `sensiveis.length > 0` (já é o caso) — auditar pra ter certeza que não está vindo array `[""]` ou com strings vazias depois do `.trim()`. Adicionar filtro `.filter(Boolean)` no `normalize` do edge.

### D) Reprocessar retrato existente

Como o retrato cacheado do Eduardo já foi gerado com as regras antigas, após o deploy do prompt novo:
- Forçar regeneração: hook do frontend já checa staleness >24h, mas pra acelerar, adicionar fallback de "regenera se `insights_version` é diferente do hash atual". Isso já está implementado no edge — só precisa o usuário abrir o portal pra disparar (ou pode-se invocar manualmente uma vez via SQL/edge call).

---

## Arquivos a tocar

- `supabase/functions/generate-user-portrait/index.ts` — endurecer prompt (seção REGRAS DURAS), endurecer `normalize` (filtrar `Aura` em pessoas, `.filter(Boolean)` em todos os arrays).
- `src/components/portal/SobreVoceTab.tsx` — adicionar `THEME_BLACKLIST` + normalização de capitalização + dedup por substring no `useMemo` de `dedupedThemes`; ajustar classes Tailwind de chips de Conquistas e Temas.

## Fora de escopo

- Não mexer em `session-extractor`, `user_insights`, nem `session_themes` (dados brutos continuam como estão; a curadoria é toda no edge + frontend).
- Não adicionar avatar/foto de perfil (já decidido anteriormente).
- Não mudar o schema do `user_portraits`.

## Resultado esperado

Eduardo abre `/meu-espaco` e vê:
- Pessoas reais: apenas Filhas (Bella, Selena) e Esposa (sem fofoca episódica) — Aura sumiu da lista.
- Temas só de vida: ansiedade, conexão com filhas, equilíbrio trabalho e família, sono, liberdade — todos com capitalização consistente, dedupados, com respiro visual.
- Padrões sem meta-conversa.
- Chips de conquistas legíveis com espaçamento real.
