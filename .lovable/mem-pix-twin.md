---
name: Fatura gêmea de ciclo 1 no PIX Automático
description: Asaas emite fatura duplicada de ciclo 1 quando startDate=hoje; dedupe em tempo real no webhook + backstop na auditoria
type: feature
---
Com `paymentCreationMode: SUBSCRIPTION` e `startDate = hoje`, a Asaas cria DUAS cobranças no dia 1: o QR imediato (que ativa o consentimento e é pago por débito automático, chega sem `subscription` e com description "Cobrança gerada automaticamente a partir de Pix recebido") e a fatura do ciclo 1 da assinatura (com `subscription` e description "Aura <plano> mês"). A segunda é duplicada e virava OVERDUE.

Tratamento:
- `webhook-asaas`: cobrança PENDING/OVERDUE com subscription/auth vinculada e gêmea PIX_AUTOMATIC já paga (mesmo customer, mesmo valor, vencimento com tolerância de 1 dia) → `DELETE /payments/{id}` na Asaas em tempo real.
- `asaas-pix-auto-audit`: mesmo sweep como backstop (candidatas com vencimento até HOJE) e essas gêmeas NÃO contam como "débito automático não disparado".

Importante: os alertas antigos de "débito automático não disparou" (Leandro 06/07, Francisco 02/07, Felipe 30/06) eram essas gêmeas, não falha de débito. `startDate` no próximo ciclo segue como possível correção de raiz, ainda NÃO testada.
