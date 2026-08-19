---
name: Parcela do carnê Woovi só aparece no extrato
description: Pagamentos de parcela (Pix Automático) não vêm em /api/v1/charge nem por webhook; reconciliação é pelo /api/v1/transaction
type: feature
---
No trilho Woovi, a **parcela do carnê** (débito do mandato / Pix Automático, inclusive a 1ª cobrança da jornada `PAYMENT_ON_APPROVAL`) é liquidada e aparece **apenas no extrato** (`GET /api/v1/transaction`):

- **não** aparece em `GET /api/v1/charge` (nem filtrando por CPF/correlationID — os filtros são ignorados);
- `GET /api/v1/subscriptions/{correlationID}` **não** retorna `charges`/`installments`;
- **nenhum webhook de cobrança** chega para essa parcela (só chega o `PIX_AUTOMATIC_APPROVED` do mandato).

Consequência (caso real 19/08/2026, CPF 01979755000, R$ 29,90): dinheiro na conta, mandato aprovado e **zero registro local** — sem `woovi_charges`, sem `entry_paid_at`, sem ativação.

**Reconciliação canônica:** varredura 6 do `woovi-pix-audit` lê o extrato dos últimos 3 dias, casa o pagador por CPF (fallback e-mail → últimos 8 dígitos do telefone) com `woovi_subscriptions`, ignora se já existe pagamento local com mesmo valor em janela de 3 dias, e faz **replay** `OPENPIX:CHARGE_COMPLETED` para o `webhook-woovi` usando `endToEndId` como `installment_id`. O webhook segue sendo a única fonte de verdade da ativação.

**Regra de investigação:** "não achei o pagamento" na Woovi nunca conclui nada antes de checar o extrato — a API de cobranças mente por omissão nesse trilho.
