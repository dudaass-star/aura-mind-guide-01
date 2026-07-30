# Cobrança PIX duplicada da Elenice: causa e correção

## O que os dados mostram

As duas cobranças do mesmo dia (30/07, R$ 49,90) têm origens diferentes e comprovadamente distintas:

| Cobrança | Origem no payload | Status |
|---|---|---|
| `pay_9e0rkmq4rqtfzv6t` | `description: "Cobrança gerada automaticamente a partir de Pix recebido"`, sem campo `subscription`, `pixTransaction` preenchido | RECEIVED (débito automático, 17:43) |
| `pay_5r3g1m1h7tz0ceyu` | `description: "Aura Direção mês"`, `subscription: sub_4t2jepnmp80fkt41`, `dueDate: 2026-07-30` | PENDING (criada 17:44) |

Ou seja: **não houve caminho duplicado no nosso código** — não geramos cobrança avulsa em lugar nenhum. A duplicação vem do desenho da chamada: em `criar-pix-recorrente-asaas` mandamos `paymentCreationMode: "SUBSCRIPTION"` com `startDate: todayBRT`. O Asaas então (1) cobra o QR imediato do primeiro pagamento e (2) cria a assinatura com primeiro vencimento **hoje**, gerando a fatura do ciclo 1 no mesmo dia que o pagamento imediato já cobriu.

Efeito colateral já observado nessa conta: a fatura pendente entrou no fluxo de recuperação de carrinho (`whatsapp_recovery_15min_sent_at` gravado às 18:00, felizmente barrado por `skipped: active_customer_email`). Se ela ficar pendente, vira OVERDUE, dispara e-mail de cobrança da Asaas para uma cliente que já pagou, e polui o funil do admin.

## Correção

### 1. Assinatura passa a começar no ciclo seguinte (raiz)
Em `criar-pix-recorrente-asaas`, `startDate` deixa de ser hoje e passa a ser hoje + 1 período (mês/trimestre/semestre/ano, conforme `billing`), calculado em BRT. O QR imediato continua cobrindo o ciclo 1; a assinatura passa a cobrir o ciclo 2 em diante. Isso elimina a fatura duplicada na origem para toda nova venda.

Ressalva honesta: se a Asaas exigir `startDate` igual a hoje em autorização Bacen, o fallback é manter hoje e depender do item 2. Validar esse ponto é o primeiro passo da implementação.

### 2. Limpeza automática de fatura duplicada (rede de segurança)
Na auditoria diária (`asaas-pix-auto-audit`), nova regra: para cada autorização ACTIVE, se existirem duas cobranças com o **mesmo vencimento e mesmo valor**, uma `RECEIVED` via PIX_AUTOMATIC e outra `PENDING`, cancelar a pendente na Asaas (`DELETE /payments/{id}`) e marcá-la como `CANCELLED` no banco, com log. Só age nesse padrão exato — nunca cancela cobrança pendente sem uma paga gêmea.

### 3. Não recuperar carrinho de quem já pagou
No fluxo de recuperação de PIX pendente, ignorar cobrança pendente cujo customer tenha outra cobrança `RECEIVED` com o mesmo vencimento e valor. Hoje o bloqueio só aconteceu por acaso (cliente já ativa).

### 4. Ação pontual na conta da Elenice
Cancelar `pay_5r3g1m1h7tz0ceyu` na Asaas e no banco, para não virar OVERDUE nem gerar e-mail de cobrança indevido.

## Detalhes técnicos

- `supabase/functions/criar-pix-recorrente-asaas/index.ts:237` — `startDate: todayBRT` → data do próximo ciclo por `billing` (`monthly` +1M, `quarterly` +3M, `semestral` +6M, `yearly` +1A), com helper em BRT; `immediateQrCode` intocado.
- `supabase/functions/asaas-pix-auto-audit/index.ts` — novo passo "sweep de fatura duplicada" usando o helper de fetch existente + `DELETE /payments/{id}`.
- Detecção do par: `asaas_payments` filtrado por `asaas_customer_id`, `amount_cents` iguais e `raw_payload->>dueDate` iguais, um `RECEIVED` com `payment_method = 'PIX_AUTOMATIC'` e outro `PENDING`.
- Recuperação de carrinho: mesma checagem antes de enviar, no fluxo de recuperação PIX/abandono.
- Redeploy de `criar-pix-recorrente-asaas` e `asaas-pix-auto-audit`.