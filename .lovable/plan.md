## Ajuste UX — Empty state pré-cron em "Sua jornada"

Único ajuste necessário: cobrir o buraco entre "aba já existe" e "primeiro cron ainda não rodou". Sem isso, quem entrar antes do dia 1 vê uma tela vazia sem contexto.

### Diagnóstico

Hoje `JornadaTab.tsx` tem 3 estados:
- **Com dados** → renderiza timeline por tema.
- **`insufficient_data`** → card cinza "vocês conversaram pouco esse mês".
- **Sem nenhum registro** → cai num empty state genérico (ou vazio total).

O terceiro estado hoje não distingue entre "usuário novo que ainda não teve mês fechado" e "erro/vazio real". É esse gap que a copy precisa cobrir.

### Regra de decisão do empty state

Ao carregar a aba, contar snapshots do usuário:

```text
snapshots.length === 0
  ├─ profile.created_at > início do mês corrente
  │     → "Sua primeira jornada chega no dia 1 de {próximo mês}"
  │
  └─ profile.created_at <= início do mês corrente
        → "Ainda não temos material suficiente. Continue conversando —
           sua próxima jornada é gerada no dia 1 de {próximo mês}."
```

Dois textos porque a expectativa é diferente: usuário de 3 dias precisa saber que é normal não ter nada; usuário de 2 meses precisa saber que o volume de conversa dele foi baixo E quando o próximo ciclo roda.

### Mudanças

**Arquivo único:** `src/components/portal/JornadaTab.tsx`

1. Adicionar branch de empty state antes do render da timeline.
2. Calcular `nextCronDate` = dia 1 do próximo mês, formato "1 de agosto".
3. Ler `profile.created_at` (já disponível no contexto do portal via `usePortalProfile` ou prop equivalente — confirmar na leitura do arquivo em build).
4. Card centralizado, mesmo padrão visual dos outros empty states do portal (`shared.tsx`), com ícone discreto e 2 linhas de copy.

Sem migration, sem edge function, sem mudança em outros arquivos.

### Fora de escopo (confirmado com o usuário)

- Esconder aba até ter dado.
- Badge "novo" + tooltip.
- Ajuste mobile dedicado (fica pra depois se aparecer feedback real).
- Sinalização visual da mudança na carta mensal.