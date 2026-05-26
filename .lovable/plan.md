## Problema

O card "Recuperação por WhatsApp" mostra **1 converteram**, mas no banco há **5 conversões reais** após disparos de WhatsApp (consulta validada agora). Ontem houve recuperações que não estão aparecendo.

## Causa

Em `src/pages/AdminEngagement.tsx` (`fetchRecoverySessions`), as métricas `stage1`, `stage2`, `errors` e `unique` são calculadas via `count: 'exact'` sobre toda a tabela `checkout_sessions` (por isso aparecem 499 / 483 / 46 / 63 corretamente).

Mas o `converted` é calculado em cima de `waSessions = enriched.filter(...)`, e `enriched` vem de `uniqueSessions`, que por sua vez é construído a partir de uma query com **`.limit(50)`** (linha 358). Só as 50 sessões abandonadas mais recentes entram no cálculo — sessões mais antigas que converteram (inclusive as de ontem) ficam fora.

Resultado: 1 conversão visível ≠ 5 conversões reais.

## Plano

Calcular `whatsappStats.converted` no servidor, sem depender do `limit(50)` usado para popular a tabela de detalhes.

Em `src/pages/AdminEngagement.tsx`, dentro de `fetchRecoverySessions`:

1. Adicionar uma query dedicada que traga **todas** as sessões com `whatsapp_recovery_15min_sent_at` ou `whatsapp_recovery_24h_sent_at` não nulos, selecionando apenas `email, phone, whatsapp_recovery_15min_sent_at, whatsapp_recovery_24h_sent_at` (campos leves).
2. Trazer também todas as `checkout_sessions` com `status='completed'` cujos `email`/`phone` batam com esse conjunto (mesma estratégia atual de `completedByEmail` / `completedByPhone`, mas aplicada ao conjunto completo de WA).
3. Calcular `converted` como o número de sessões WA em que existe um checkout `completed` posterior ao primeiro `sent_at` (lógica idêntica à atual, só que sobre o universo completo).
4. Usar esse valor em `setWhatsappStats({ ..., converted })`.
5. A tabela de detalhes "Recuperações abandonadas" continua usando o `.limit(50)` atual — não muda nada na UI fora do número do card.

## Validação

- Após o deploy, o card deve mostrar **5 converteram** (estado atual do banco), não 1.
- Os outros números (499 / 483 / 46 / 63) seguem inalterados.
- Confirmar visualmente em `/admin/engagement`.

## Escopo

Mudança isolada em uma função do front-end (`fetchRecoverySessions`). Sem alteração de schema, edge functions ou lógica de envio.
