---
name: Defesa automática de disputa Woovi
description: Defesa Woovi exige webhook mais reconciliação recorrente; evidência só com consentimento e uso, no formato { documents: [...] }
type: feature
---
- Chave Woovi já tem os escopos: `GET /api/v1/dispute` (lista) e `POST /api/v1/files` (upload) funcionam.
- Fluxo automático: webhook-woovi detecta disputa → grava em `woovi_disputes` → invoca `woovi-dispute-defense`, que monta PDF do dossiê, sobe em `/api/v1/files` e envia em `POST /api/v1/dispute/{id}/evidence`.
- **Formato da evidência**: a conta real aceita apenas `{ documents: [ { fileId, description, correlationID } ] }`. O corpo "documento nu" da doc devolve 400 — ele ficou só como fallback.
- Defende compra autorizada quando o pagamento e a entrega do acesso estão comprovados. Uso real (mensagens/sessões) fortalece o dossiê, mas não é condição para reconhecer a legitimidade da compra.
- Compras avulsas de R$ 6,90 são vinculadas por valor, data e banco pagador em `taster_offers`; não devem ser tratadas como assinatura recorrente.
- Disputa MED com `status = REJECTED` na Woovi = contestação negada pelo Bacen, ou seja, ganhamos.
- O webhook não é garantia de entrega de novas disputas. Uma reconciliação recorrente deve listar a Woovi, registrar ausentes e tratar imediatamente apenas as abertas.
- Disputa aberta sem evidência após a reconciliação deve gerar alerta administrativo; disputas encerradas nunca recebem envio tardio.
