
# Diagnóstico geral

Nas últimas 3 vezes que a Aura "esqueceu" algo do Eduardo (04/06, 18/06, 02/07), o padrão foi idêntico:

- Um insight ou commitment **de fase de planejamento** ("planejando volta aos treinos", "conversar com esposa sobre X") ficou vivo depois que o usuário já executou/resolveu.
- Ninguém marcou como resolvido, porque o único mecanismo automático hoje é `cancel_topics` — que só age quando o usuário **recusa** ("não quero", "para de insistir"). Não existe equivalente para "**já fiz / já resolvi / já aconteceu**".
- `pattern-analysis` (nudge semanal por LLM) escolhe UM insight sem checar idade nem contradições recentes. Ele pega o "mais acionável" — que quase sempre é o mais antigo, porque nunca foi encerrado.

O problema não é específico de treino. É **estrutural**: o sistema acumula "combustível para nudge" indefinidamente e nunca queima.

# Princípio da correção

**Não adicionar regras novas por domínio.** Fazer duas coisas simples, universais, que reduzem o combustível velho:

1. Espelho universal do `cancel_topics` para conclusão.
2. Filtro de decaimento por tempo no que alimenta o `pattern-analysis`.

Nada de novo campo, nada de nova tabela, nada de novo modelo. Só reaproveita o que já existe.

# Plano

## 1. `resolved_topics` no post-analysis extractor (espelho do `cancel_topics`)

`supabase/functions/aura-agent/index.ts > postConversationAnalysis`.

Adicionar UMA regra ao prompt do extractor Flash-lite (paralela à regra 6 existente de `cancel_topics`):

> **7.** Se o usuário sinalizar que **já fez / já resolveu / já aconteceu / já não é mais um problema** algo que estava pendente (ex.: "já voltei a treinar", "já conversei com ela", "já resolvi aquilo", "isso já passou"), preencher `resolved_topics: string[]` com palavras-chave curtas (1-3 palavras, minúsculas).

Handler idêntico ao de `cancel_topics`, só muda o status final:

```ts
// para cada topic em resolved_topics
UPDATE commitments
SET commitment_status='completed', completed=true
WHERE user_id=$1
  AND commitment_status='pending'
  AND (title ILIKE '%'||topic||'%' OR description ILIKE '%'||topic||'%');

UPDATE user_insights
SET importance = GREATEST(importance - 2, 3),
    last_mentioned_at = now()
WHERE user_id=$1
  AND (key ILIKE '%'||topic||'%' OR value ILIKE '%'||topic||'%')
  AND key ~* '^(retomar|planejar|iniciar|começar|conversar_sobre)';
```

Rebaixar `importance` (em vez de deletar) preserva a memória histórica, mas tira o insight do topo do ranking que o `pattern-analysis` consome.

**Por que é simples:** o modelo já sabe extrair `cancel_topics`; adicionar um campo paralelo é trivial. Handler é copy-paste do existente. Zero regra por tema.

## 2. Decaimento por tempo no input do `pattern-analysis`

`supabase/functions/pattern-analysis/index.ts`.

Duas linhas de filtro adicional na query de insights (linha ~305) e uma proteção para commitments:

```ts
// insights: ignora "planejamento antigo"; identidade/trauma (importance >= 8) sempre passam
.or('importance.gte.8,last_mentioned_at.gte.' + fortyFiveDaysAgo.toISOString())

// commitments: só considera pending recentes como "combustível de nudge"
// (já existentes na análise permanecem apenas se created_at >= 45d)
```

Corte de 45 dias. Insights de identidade/valores/trauma (importance ≥ 8) sempre entram — são estáveis por natureza. Insights de "planejando X" (importance 4-6) decaem naturalmente se ninguém os revalidou.

**Por que é simples:** um filtro SQL. Zero mudança no prompt do LLM, zero nova instrução para o modelo seguir.

## 3. Backfill único do Eduardo

Encerra o passivo já acumulado e para os nudges de treino a partir de hoje:

```sql
UPDATE commitments
SET commitment_status='completed', completed=true
WHERE user_id='d2d4526a-0094-4e26-a435-429ed074b102'
  AND commitment_status='pending'
  AND (title ILIKE '%trein%' OR title ILIKE '%academ%');

UPDATE user_insights
SET importance = 4, last_mentioned_at = now()
WHERE user_id='d2d4526a-0094-4e26-a435-429ed074b102'
  AND key IN ('retomar_treinos','retomada_treinos','horario_treino');
```

Não deleta nada. Só rebaixa e fecha.

# Arquivos afetados

- `supabase/functions/aura-agent/index.ts` — +1 regra no prompt do extractor + handler ~15 linhas copiadas do `cancel_topics`.
- `supabase/functions/pattern-analysis/index.ts` — +1 filtro `.or(...)` na query de insights, +1 filtro em commitments quando forem incluídos.
- SQL ad-hoc do backfill via `supabase--insert` (Eduardo).

Zero migração de schema. Zero novo campo. Zero nova tabela.

# Por que isso pega os outros casos ("loop de assuntos já resolvidos")

- Usuário diz "já conversei com meu chefe" → `resolved_topics: ["chefe"]` → fecha os 3 commitments "conversar com chefe" abertos há 2 meses.
- Usuário diz "já saí daquele emprego" → fecha "avaliar mudança de emprego".
- Insight "está pensando em terapia" de 3 meses atrás sem menção nova → decai pelo filtro de 45d, não vira nudge.
- Commitment "meditar amanhã" de março → não entra mais no `pattern-analysis` pelo corte de tempo.

Nenhum desses casos precisou de regra específica. É o mesmo mecanismo agindo.

# Riscos e mitigações

- **`resolved_topics` falso-positivo em frases hipotéticas** ("se eu voltasse a treinar"). Mitigação: regra do prompt exige verbo em passado/presente factivo. Mesmo se falhar, o pior é fechar um commitment que voltará se o assunto reaparecer — não é destrutivo (histórico permanece em `messages`).
- **Corte de 45d esconde algo importante e velho.** Mitigação: `importance ≥ 8` sempre passa. Identidade, trauma, metas centrais (que são exatamente os insights que a Aura precisa lembrar sempre) ficam imunes ao filtro.
- **Drift de deploy do `aura-agent`** (memória `aura-agent-deployment-and-fallback-safety`). Validar em 5 min pós-deploy com `failed_message_log` e forçar `deploy_edge_functions` se preciso.

# Validação

1. `pattern-analysis` em dry-run com `target_user_id` do Eduardo → saída não menciona treino/academia.
2. Query de sanity: `SELECT count(*) FROM commitments WHERE commitment_status='pending' AND created_at < now() - interval '60 days'` — número deve cair drasticamente à medida que usuários conversarem nas próximas semanas (via `resolved_topics`).
3. Teste manual: enviar "já resolvi aquilo do trabalho" para um usuário de teste com commitment pendente sobre "trabalho" → verificar que virou `completed`.
