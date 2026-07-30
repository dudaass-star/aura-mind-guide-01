# Fatura de ciclo 1 duplicada no PIX Automático: verificação e correção

## Sim, é isso — e não é só a Elenice

Confirmado nos dados: **nenhum caminho do nosso código gerou cobrança avulsa**. O par nasce do próprio desenho da chamada. Em `criar-pix-recorrente-asaas` enviamos `paymentCreationMode: "SUBSCRIPTION"` com `startDate = hoje`. A documentação da Asaas confirma que o `immediateQrCode` já é "o primeiro pagamento do fluxo"; a assinatura criada em cima da autorização começa a vigência no `startDate` e emite a fatura do ciclo 1 **no mesmo dia** — cobrando de novo o que o QR imediato acabou de cobrar.

O padrão se repete nas três autorizações ACTIVE com assinatura:

| Cliente | QR imediato (pago) | Fatura da assinatura, mesmo vencimento | Ciclos seguintes |
|---|---|---|---|
| Elenice 30/07 | `pay_9e0r…` RECEIVED | `pay_5r3g…` PENDING (30/07) | — |
| Leandro 06/07 | `pay_gnv8…` RECEIVED | `pay_kvck…` **OVERDUE** (06/07) | 06/08 e 06/09 PENDING |
| Juscileia 02/07 | `pay_agb0…` RECEIVED (avulsa) | `pay_4c4l…` **OVERDUE** (02/07) | 02/08 e 02/09 PENDING |

A assinatura das cobranças pagas vem sem `subscription` no payload e com `description: "Cobrança gerada automaticamente a partir de Pix recebido"`; as duplicadas vêm com `subscription: sub_…` e `description: "Aura … mês"`. Distinção limpa.

### Consequência importante: revisão de um diagnóstico anterior

Os "débitos automáticos que não dispararam" que a auditoria apontou (Leandro 06/07, Juscileia 02/07) **eram exatamente essas faturas duplicadas de ciclo 1**, vencidas porque ninguém as pagaria duas vezes. Não eram falha de débito. O teste real do débito automático segue pendente: as primeiras faturas de ciclo 2 vencem 02/08 (Juscileia) e 06/08 (Leandro).

Efeito colateral já visto: a duplicada da Elenice entrou no fluxo de recuperação de carrinho às 18:00 (barrada por acaso, `skipped: active_customer_email`) e, se ficar, vira OVERDUE + e-mail de cobrança da Asaas para quem já pagou.

## Solução recomendada (revisada)

A ideia anterior — mudar `startDate` para o próximo ciclo — resolve na raiz, mas mexe na vigência da autorização Bacen, que é justamente a parte que já custou caro. Então ela deixa de ser o passo 1 e passa a ser testada depois, em sandbox. A correção principal passa a ser determinística e de baixo risco:

### 1. Deduplicação em tempo real no webhook (principal)
Em `webhook-asaas`, ao processar `PAYMENT_CREATED`/`PAYMENT_UPDATED` de uma cobrança `PENDING` com `subscription` vinculada a uma autorização PIX Automático: se já existir cobrança `RECEIVED` do mesmo customer, mesmo valor e mesmo `dueDate`, cancelar a pendente na Asaas (`DELETE /payments/{id}`) e gravá-la como `CANCELLED` no banco, com log explícito. Age em segundos, antes de qualquer e-mail de vencimento. Condição estrita — nunca cancela pendente sem gêmea paga.

### 2. Backstop na auditoria diária
Mesma regra em `asaas-pix-auto-audit`, para pegar webhook perdido. Também deixa de contar par duplicado como "falha de débito automático" no alerta admin, que é o que produziu os alarmes falsos de Leandro e Juscileia.

### 3. Recuperação de carrinho não persegue quem já pagou
No fluxo de recuperação de PIX pendente, ignorar cobrança pendente cujo customer tenha outra `RECEIVED` com mesmo valor e vencimento.

### 4. Teste de `startDate` no próximo ciclo (sandbox, depois)
Criar uma autorização em sandbox com `startDate = hoje + 1 período` e verificar se (a) a Asaas aceita, (b) o QR imediato continua ativando a autorização, (c) a assinatura nasce só com a fatura do ciclo 2. Se passar nos três, vira a correção de raiz em produção e o item 1 fica como rede de segurança. Se não passar, ficamos com 1+2, que já resolvem o efeito prático.

### 5. Limpeza pontual
Cancelar `pay_5r3g1m1h7tz0ceyu` (Elenice) e as duas duplicadas já vencidas (`pay_kvck…`, `pay_4c4l…`) na Asaas e no banco.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts` — novo bloco após a resolução de vínculo da cobrança; identifica gêmea por `asaas_customer_id` + `amount_cents` + `raw_payload->>'dueDate'`, com a paga tendo `payment_method = 'PIX_AUTOMATIC'` e `status = 'RECEIVED'`; `DELETE /payments/{id}` com a chave já usada no arquivo.
- `supabase/functions/asaas-pix-auto-audit/index.ts` — mesmo sweep no loop de autorizações ACTIVE + exclusão desses pares da contagem de falha de débito.
- Fluxo de recuperação de PIX pendente — checagem de gêmea paga antes de enviar.
- `supabase/functions/criar-pix-recorrente-asaas/index.ts:237` — só no item 4: `startDate: todayBRT` → próximo ciclo por `billing` (monthly +1M, quarterly +3M, semestral +6M, yearly +1A) em BRT, `immediateQrCode` intocado.
- Redeploy de `webhook-asaas` e `asaas-pix-auto-audit`.