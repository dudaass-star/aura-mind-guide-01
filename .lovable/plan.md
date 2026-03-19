

## Problema

A edge function `admin-engagement-metrics` **nao foi implantada** com o codigo novo. A resposta da API ainda retorna o formato antigo (com `phaseDistribution`, `trialValueDeliveredCount`, etc.) e **sem** os campos de custo (`totalCostUSD`, `avgCostPerActiveUser`, `costBreakdownByModel`, `totalCacheSavings`).

Evidencia: a resposta da API capturada nos network requests mostra:
```json
{"activeUsers":9,...,"phaseDistribution":{"listening":54,...},...}
```
Sem nenhum campo de custo. O frontend espera esses campos e quebra no `.toFixed()`.

## Solucao

1. **Forcar redeploy da edge function** `admin-engagement-metrics` -- o codigo no repositorio ja esta correto com as queries de custo, basta garantir que seja implantado

2. **Adicionar guard extra no frontend** para o caso do backend retornar dados incompletos (resiliencia) -- verificar se o `metrics` tem a propriedade antes de renderizar a secao de custos

### Arquivo editado
- `src/pages/AdminEngagement.tsx` -- adicionar `metrics.totalCostUSD !== undefined` como condicao para renderizar a secao de custos, prevenindo crash enquanto a edge function nao estiver atualizada

