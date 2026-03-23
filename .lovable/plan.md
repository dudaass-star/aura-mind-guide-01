

# Correção: Relatório semanal escalável (batch processing)

## Problema

A função `weekly-report` processa TODOS os usuários em uma única execução. Com o anti-burst delay de 25-45s por envio, 18 usuários já causaram timeout (~150s limite). Com 250 usuários por instância (e múltiplas instâncias), isso é inviável.

## Solução: Processamento em lotes (batch)

Em vez de processar todos os usuários de uma vez, a função aceita parâmetros `batch_size` e `offset`, processando apenas um lote por invocação. Um cron job dispara a função várias vezes, ou a própria função se re-invoca para o próximo lote.

### Arquitetura

```text
Cron (19h domingo)
  └─> weekly-report (offset=0, batch_size=10)
        ├─ Processa usuários 0-9
        ├─ Envia relatórios (delay 3s entre cada)
        └─ Se há mais usuários → chama a si mesma (offset=10)
              ├─ Processa usuários 10-19
              └─ Se há mais → chama a si mesma (offset=20)
                    └─ ... até acabar
```

### Detalhes técnicos

**Arquivo**: `supabase/functions/weekly-report/index.ts`

1. **Novos parâmetros no body**: `batch_size` (default 10), `offset` (default 0)
2. **Query paginada**: `.range(offset, offset + batchSize - 1).order('created_at')`
3. **Anti-burst reduzido**: 3 segundos entre envios (suficiente para não sobrecarregar Z-API, mas rápido para caber no timeout)
4. **Auto-invocação**: Se ainda há usuários restantes, a função faz um `fetch()` para si mesma com `offset + batchSize`, disparando o próximo lote
5. **Tracking**: Registrar na tabela `weekly_plans` quem já recebeu para evitar duplicatas em caso de re-execução

### Capacidade estimada

- 10 usuários por lote × ~3s delay = ~30s de envio + ~5s AI analysis = ~50s por lote (bem dentro do timeout de 150s)
- 250 usuários = 25 lotes encadeados, processados sequencialmente
- Múltiplas instâncias com 250 cada = escala linearmente

### Ação imediata

Depois de implementar o fix, reenviar os relatórios para os ~11 usuários que não receberam no domingo.

