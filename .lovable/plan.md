## Objetivo

Construir **apenas o diagnóstico** de churn precoce (D8-D30). Sem antecipar plano de ação. Vamos ler os números reais primeiro e decidir baseado neles.

## Hipótese a validar

Dos usuários que cancelaram entre D8 e D30, **quantos efetivamente experimentaram** o arsenal de retenção que já existe (jornadas, meditações, sessões 45min, insights, cápsula, relatório semanal/mensal, portal)?

- Se a maioria **não experimentou** → problema é timing/exposição.
- Se a maioria **experimentou e ainda assim cancelou** → problema é fit do produto.

## Entregáveis

### 1. Edge function `admin-churn-diagnosis` (read-only, admin-only)

Padrão idêntico ao `admin-engagement-metrics`:
- Validação JWT via `getClaims()` + `has_role('admin')`.
- CORS padrão.
- Cache em memória 5 min com `forceRefresh`.

**Input:** `{ windowDays?: number }` (default 60, máx 180).

**Lógica:**

1. Buscar todos os perfis com `cancellation_feedback.action_taken = 'canceled'` na janela.
2. Calcular `lifetime_days = canceled_at - created_at`. Filtrar `lifetime_days BETWEEN 8 AND 30`.
3. Para cada perfil cancelado, contar (lendo direto das tabelas existentes):

| Sinal | Tabela / regra |
|---|---|
| Total mensagens user-role | `messages where role='user'` |
| Dias ativos com ≥1 msg | `count(distinct date(created_at))` em `messages` |
| Sessões iniciadas | `sessions where status in ('active','completed')` |
| Sessões completas | `sessions where status='completed' AND ended_at not null` |
| Sessões com summary real | `sessions where session_summary not null` |
| Jornada iniciada | `profiles.current_journey_id not null` OR `current_episode > 0` |
| Episódios consumidos | `profiles.current_episode` |
| Meditação recebida | indireto via `messages` contendo URL de `meditation_audios` (busca por padrão de URL) |
| Insight Oráculo | `profiles.last_proactive_insight_at not null` (na janela de vida) |
| Insight inicial trial | `profiles.trial_insight_sent_at not null` |
| Cápsula recebida | `profiles.awaiting_time_capsule` ou msg com `pending_capsule_audio_url` consumido |
| Carta mensal recebida | `monthly_letters where user_id=X AND sent_at not null` |
| Relatório mensal gerado | `monthly_reports where user_id=X` |
| Check-in respondido | `profiles.last_checkin_sent_at not null` (proxy) |
| Compromissos criados | `commitments where user_id=X` |
| Temas detectados | `session_themes` |

4. Classificar cada cancelado em segmento:
   - **Não experimentou** (0-1 features tocadas)
   - **Experimentou parcial** (2-3)
   - **Experimentou muito** (4+)

5. Agregados de saída:

```json
{
  "windowDays": 60,
  "totalCanceled8_30d": 43,
  "byFeatureExposure": {
    "completedSession":      { "count": 5,  "pct": 11.6 },
    "startedJourney":        { "count": 12, "pct": 27.9 },
    "receivedMeditation":    { "count": 3,  "pct": 7.0  },
    "receivedOracleInsight": { "count": 8,  "pct": 18.6 },
    "receivedCapsule":       { "count": 1,  "pct": 2.3  },
    "receivedMonthlyLetter": { "count": 0,  "pct": 0    },
    "createdCommitment":     { "count": 4,  "pct": 9.3  }
  },
  "engagementVolume": {
    "avgMessagesUntilChurn": 38,
    "medianMessagesUntilChurn": 22,
    "avgActiveDaysUntilChurn": 6.4,
    "silentChurners": 3
  },
  "bySegment": {
    "naoExperimentou": { "count": 28, "pct": 65.1 },
    "experimentouParcial": { "count": 12, "pct": 27.9 },
    "experimentouMuito": { "count": 3, "pct": 7.0 }
  },
  "cancelDayHistogram": { "8":4, "9":7, "10":5, "11":3, ..., "30":1 },
  "topReasons": [
    { "reason": "too_expensive", "count": 18 },
    { "reason": "missing_features", "count": 9 },
    ...
  ],
  "verdict": "exposure_problem" // ou "fit_problem" ou "mixed"
}
```

**Lógica do `verdict`:**
- `exposure_problem` se `naoExperimentou.pct > 60`
- `fit_problem` se `experimentouMuito.pct > 40`
- `mixed` caso contrário

### 2. UI: novo card no `AdminEngagement.tsx`

Card "🔍 Diagnóstico de Churn Precoce (D8-D30)" abaixo de Retenção por Coorte:

- 3 buckets coloridos lado a lado (Não experimentou / Parcial / Muito) com count + %.
- Lista vertical de exposição por feature (barra horizontal + count + %).
- Sub-card "Volume de engajamento" (média/mediana de mensagens, dias ativos, "silent churners").
- Histograma simples do dia do cancelamento (D8 a D30).
- Box de veredicto colorido no topo:
  - Verde: "Problema é fit. Features chegaram mas não seguraram. Considerar mudança de oferta."
  - Amarelo: "Misto."
  - Vermelho: "Problema é timing/exposição. Maioria cancelou sem testar o que existe."
- Seletor de janela: 30/60/90/180 dias.
- Botão "Atualizar" com `forceRefresh`.

## Detalhes técnicos

- Função: `supabase/functions/admin-churn-diagnosis/index.ts`. Sem mudança no `config.toml`.
- Sem migrations.
- Sem novos secrets.
- Custo: queries SQL paginadas via service role; nenhuma chamada de IA.
- Performance esperada: 2-5s para janela de 60d (~50-100 perfis), mais rápido com cache.

## Não faz parte deste escopo

- Programa "Primeiros 15 Dias" — só será planejado **depois** que lermos o veredicto.
- AURA Health — adiado.
- Qualquer mudança em prompts, pricing ou jornadas existentes.

## O que vem depois

Roda 1x, lê o veredicto, e aí decidimos juntos:
- Se "exposure_problem" → planejar antecipação determinística de entregas no D2-D14.
- Se "fit_problem" → repensar oferta (talvez paywall pós-D7 mais flexível, ou mudar pricing).
- Se "mixed" → ataque duplo, escopo menor.
