---
name: PIX Automático Inter completo
description: Trilho Bacen pelo Banco Inter — Jornada 3, ciclos D-2 sem aviso prévio, 3R/7D, auditoria, cancelamento de mandato, troca de plano e portal
type: feature
---

- Criação: `criar-pix-recorrente-inter` (QR composto = 1º pagamento + mandato). `_shared/inter-pix.ts` faz mTLS + cache de token.
- Ciclos: `inter-pix-cycle-runner` (cron) emite `cobr` em D-2, só para mandatos `APROVADA`/`ATIVA`, sem nenhum aviso ao cliente antes do débito. Retentativa 3R/7D.
- Ingestão: `webhook-inter` trata `pix`/`cobr`/`rec`. Webhooks do Inter são NÃO assinados — a confiança vem de `confirmWithInter` (verificação back-channel na API antes de liberar acesso). As três rotas (`/pix/v2/webhook/{chave}`, `webhookcobr`, `webhookrec`) devem estar registradas; `inter-schema-probe?probe=register` registra e `asaas-health-check` cobra.
- `inter_pix_recurrences.user_id` é FK para `profiles.id` (não o UUID `user_id`).
- Reautorização: `pix-reauth-router` detecta `profiles.card_gateway` e roteia Asaas vs Inter; `/reautorizar-pix` usa o router.
- Troca de plano: `change-inter-plan` aceita `token` (link) OU `userId` (portal autenticado), cancela o mandato atual e devolve QR novo — valor no Bacen é fixo, trocar exige nova autorização. `ChangePlanDialog` mostra o QR + copia-e-cola; "atualizar forma de pagamento" no portal explica que não há cartão.
- Health gate: `asaas-health-check` aceita `probe_gateway` para sondar um trilho sem persistir `pix_rail_status` (validação antes de virar `system_config.pix_gateway`). Inter validado: 200, 3 webhooks registrados.
- Certificado Inter expira 11/08/2027 — rotação obrigatória ou a recorrência inteira para.
