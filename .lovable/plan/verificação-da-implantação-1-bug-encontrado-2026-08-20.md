# Verificação da implantação + 1 bug encontrado

## Sessão da Lidiane — implantação OK (100%)

Confirmei no código já publicado (`aura-agent` deployado):

- **Moldes literais removidos**: nenhuma ocorrência de "errando o ângulo" sobrou; as 5 instruções agora são por intenção.
- **Estado da hipótese persistido**: `aura_hypothesis_delivered`, `user_validated_hypothesis` e `user_rejected_hypothesis` estão no extractor, nas interfaces e são gravados no `last_user_context` (pegajosos no mesmo tema, zerados em recusa/tema novo).
- **Guarda anti-loop injetada em 5 pontos** do phase evaluator (transição, fechamento, sentido→movimento e cardápio de fechamento).
- **Agenda cega em sessão**: bloco de setup mensal só entra com `!sessionActive`, com log de supressão.
- **Rede de segurança de encerramento no código**: em `soft_closing`/`final_closing`/`overtime`, mensagem com cara de despedida (ou overtime) recebe `[ENCERRAR_SESSAO]` forçado.

## Bug real encontrado nos logs (não é da sessão da Lidiane)

Os logs de `admin-engagement-metrics` mostram, em todas as janelas (hoje, 7d, 14d, 30d, 90d):

```text
⚠️ Falha ao calcular métricas de correções (não crítico): TypeError: periodStart.toISOString is not a function
⚠️ Falha ao calcular closure metrics (não crítico): TypeError: periodStart.toISOString is not a function
```

Causa confirmada no código: `toBRTInterval()` devolve `periodStart`/`periodEnd` como **string** ISO, mas os dois blocos novos chamam `.toISOString()` neles. Os dois caem no catch e retornam zero.

Efeito prático: no painel admin, o **KPI "correções por 100 conversas"** e as **métricas de fechamento** (dialogada / unilateral / no-show) estão sempre em 0 — inclusive nos snapshots já salvos.

## Correção proposta

1. Em `supabase/functions/admin-engagement-metrics/index.ts`, trocar `periodStart.toISOString()` / `periodEnd.toISOString()` por `periodStart` / `periodEnd` (já são strings ISO) nos dois blocos: métricas de correções e closure metrics.
2. Redeploy da função e rodar o refresh de snapshots para repopular as janelas (hoje, 7d, 14d, 30d, 90d) com valores reais.
3. Conferir nos logs que as duas linhas de warning desapareceram e que o painel mostra números diferentes de zero.

Sem mudança de schema, sem mudança de UI.
