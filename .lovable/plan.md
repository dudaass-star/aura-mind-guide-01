## Plano — Memória Ativa (A + E)

Duas abas conectadas no `/meu-espaco`: **"O que a Aura sabe"** (ledger editável) e um indicador de **Nível de intimidade** integrado ao header do portal (sem virar gamificação).

---

### Parte A — Ledger editável

**Nova aba "O que a Aura sabe"** (ícone `BookOpen`, entre "Sua jornada" e "Sobre você").

Lista `user_insights` do usuário logado, agrupada por `category` (pessoas / fatos / identidade / rotina / preferências / outros), ordenada por `importance` desc + `mentioned_count` desc.

Cada item mostra: `key` em negrito, `value` como texto, chip com nº de menções e data da última. Três ações inline:
- **Corrigir** → abre input; ao salvar, faz `UPDATE user_insights` e cria uma linha em `user_memory_corrections` com `correction_text` no formato "Sobre '{key}': era '{valor antigo}', é '{valor novo}'" e `source='user_portal'`. Isso garante que a Aura respeite via prompt (correções já entram como prioridade máxima).
- **Apagar** → `DELETE` no insight + `INSERT` em `user_memory_corrections` com `correction_text` "Ignorar: {key} — {value}".
- **Marcar como importante** → `UPDATE importance = 10`.

Também: botão "Adicionar algo que a Aura deveria saber" no topo → cria insight `category='user_added'`, `importance=9`.

Empty state: "A Aura ainda está te conhecendo. Conforme você conversa, o que ela aprende aparece aqui e você pode corrigir a qualquer momento."

**RLS já cobre**: policies existentes em `user_insights` permitem SELECT/UPDATE/DELETE/INSERT via `auth.uid() = user_id`. Para `user_memory_corrections`, precisa nova policy de INSERT para o próprio usuário (hoje só service_role escreve).

**Consumo pela Aura**: nada muda no `aura-agent` — ele já lê `user_insights` (com `mentioned_count`) e `user_memory_corrections` como override. Correções feitas no portal entram no mesmo canal.

---

### Parte E — Nível de intimidade (sóbrio, sem gamificação)

Componente pequeno no `PortalHeader` (abaixo da frase motivacional), com uma frase e uma barra fininha de 3 estágios. Nada de XP, badges, medalhas.

**Cálculo** (client-side, uma query):
- `sessionsCount` = `sessions` do usuário com `status='completed'`
- `themesCount` = `session_themes` distintos
- `correctionsCount` = `user_memory_corrections` do usuário

**Estágios**:
| Estágio | Regra | Frase |
|---|---|---|
| Início | sessions < 3 | "A Aura está começando a te conhecer." |
| Familiaridade | sessions ≥ 3 e (themes ≥ 3 OU corrections ≥ 1) | "A Aura já entende como você funciona em algumas áreas." |
| Profundidade | sessions ≥ 10 e themes ≥ 5 | "A Aura te conhece a fundo — em várias camadas da sua vida." |

Tooltip discreto no ícone: "Baseado em sessões, temas conversados e correções que você fez."

Sem número, sem porcentagem, sem "próximo nível" — evita o efeito app de hábito que quebra o contrato clínico.

---

### Ordem de execução

1. Migration: policy de INSERT no `user_memory_corrections` para `auth.uid() = user_id`.
2. Criar `src/components/portal/MemoriaTab.tsx` (ledger).
3. Registrar aba em `UserPortal.tsx` (`TabId` + `TABS` + render).
4. Atualizar `PortalHeader` em `src/components/portal/shared.tsx` para receber `userId` e renderizar o indicador de intimidade (nova sub-função `IntimacyLevel` com useQuery próprio).
5. Passar `userId` na chamada `<PortalHeader />` em cada tab que já usa (verificar se está em `UserPortal.tsx` ou nas tabs — ajustar conforme atual).

---

### Fora de escopo agora

- Diário clínico em 1ª pessoa da Aura (opção secundária discutida) fica para depois — precisa auditoria de qualidade primeiro, mesmo padrão que aplicamos aos snapshots temáticos.
- Nenhuma mudança em `aura-agent` ou pós-análise — o ledger reaproveita canais existentes.