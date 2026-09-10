---
name: Defesa automática de disputa Woovi
description: Chave Woovi com escopos de disputa/arquivo liberados; evidência aceita só no formato { documents: [...] }
type: feature
---
- Chave Woovi já tem os escopos: `GET /api/v1/dispute` (lista) e `POST /api/v1/files` (upload) funcionam.
- Fluxo automático: webhook-woovi detecta disputa → grava em `woovi_disputes` → invoca `woovi-dispute-defense`, que monta PDF do dossiê, sobe em `/api/v1/files` e envia em `POST /api/v1/dispute/{id}/evidence`.
- **Formato da evidência**: a conta real aceita apenas `{ documents: [ { fileId, description, correlationID } ] }`. O corpo "documento nu" da doc devolve 400 — ele ficou só como fallback.
- Defende apenas com consentimento (mandato/pagamento) E uso real (>=10 mensagens ou >=1 sessão); sem isso marca `refund_suggested` e não envia nada.
- Disputa MED com `status = REJECTED` na Woovi = contestação negada pelo Bacen, ou seja, ganhamos.
