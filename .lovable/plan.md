
# Higiene Factual da Aura (enxuto)

Você tem razão. A #3 traz heurística de classificação ("factual vs interpretativo") que é frágil e vira dívida. Se o problema raiz é extração suja + contexto achatado, atacar esses dois já deve reduzir muito a necessidade da correção existir em primeiro lugar. Removida.

## Escopo

Duas mudanças cirúrgicas em `supabase/functions/aura-agent/index.ts`. Zero UI, zero schema, zero novo agente.

### 1. Filtro anti-ficção no extractor (raiz)

No prompt do `postConversationAnalysis` (~linhas 1817-1836):

- Só extrai como `category='pessoa'` quando o usuário fala do ente em **primeira mão** (ex.: "minha amiga", "meu pai", "a Angela do trabalho").
- **Não extrai** personagens de filme/série/livro/jogo, mesmo quando o usuário se compara a eles. Se for referência cultural, extrai como `category='referencia_cultural'` (string livre, não muda schema).
- Na dúvida, **não extrai** (bias para precisão).

Efeito: para de nascer "Agente J", "Boris", "Kurt" como pessoas do usuário.

### 2. Hierarquia no `formatInsightsForContext` (peso)

Hoje o formatter (~linhas 4050-4087) despeja tudo alfabético. Mudar para:

1. **Pessoas reais primeiro**, ordenadas por `mention_count` desc.
2. Depois fatos concretos (trabalho, saúde, agenda).
3. Referências culturais **por último** e rotuladas `[ficção]`.
4. Cortar em top N por categoria (ex.: 8 pessoas, 10 fatos) pra não afogar o prompt.

Efeito: a Aura vê "mãe (12 menções)" antes de "Agente J (1) [ficção]" e para de confundir quem é quem.

## Fora de escopo (agora)

- Bloco dedicado de correções factuais (removido a pedido — heurística frágil).
- Bloco determinístico de agenda de sessões passadas.
- Deduplicar entidades ("amiga" vs "Angela").
- Sub-KPI factual vs interpretativo no admin.

Se em 4 semanas o KPI já existente (correções por usuário/semana) não cair de ~13 pra <6, revisitamos com dados novos.

## Validação

- `phase_thresholds_test.ts` + inspeção do prompt renderizado num user real com muitos insights.
- Acompanhar KPI já existente no `AdminEngagement`.

## Arquivos tocados

- `supabase/functions/aura-agent/index.ts` (2 blocos: prompt do extractor + `formatInsightsForContext`).

Sem migração, sem UI, sem novo agente.
