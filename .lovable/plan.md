## Diagnóstico

O agente `recovery-agent` usa **apenas** a `recovery_knowledge_base` como fonte de verdade pra fatos. A entrada `pagamento` foi semeada antes do PIX ir pro ar e ainda diz "Por enquanto só cartão de crédito". Por isso ele disse pra Brunna que não tem PIX, mesmo o CheckoutV2 já tendo PIX via Asaas em todos os períodos.

Não é bug de código — é KB desatualizada. Fix = editar a KB + atualizar a memória de projeto que ainda dizia "Credit Card only".

## Realidade atual do checkout (CheckoutV2)

- **Cartão de crédito**: todos os planos, todos os períodos (mensal, trimestral, semestral, anual). Stripe.
- **PIX Automático (recorrente, Asaas)**: **todos os períodos, inclusive mensal** (cobra automaticamente todo mês via PIX).
- **PIX à vista (one-time, Asaas)**: só nos planos longos — trimestral, semestral, anual.
- **Boleto / débito**: continuam indisponíveis.

## Mudanças

### 1. Atualizar a entrada `pagamento` existente

`UPDATE recovery_knowledge_base SET answer = ..., keywords = ... WHERE id = 'ec841071-28c4-4552-b022-26101dc07f8b'`

Novo `answer`:

> "Aceitamos cartão de crédito e PIX. No mensal dá pra pagar no cartão ou no PIX Automático (cobrança recorrente todo mês). Nos planos trimestral, semestral e anual tem essas duas opções mais o PIX à vista (pagamento único). Boleto e débito ainda não. Você pode trocar ou cancelar a qualquer momento pelo portal."

Ampliar `keywords` com: `pix`, `pix automatico`, `pix automático`, `qr code`, `qrcode`, `asaas`, `à vista`, `avista`, `recorrente`, `anual`, `trimestral`, `semestral`.

### 2. Inserir entrada dedicada de PIX (recall maior)

Nova linha em `recovery_knowledge_base`:
- `category`: `pagamento`
- `question`: "Tem PIX?"
- `answer`: "Tem sim, em todos os planos. No mensal funciona como PIX Automático (cobrança recorrente). Nos planos trimestral, semestral e anual você também pode pagar à vista por PIX, com desconto. É só escolher PIX no checkout."
- `keywords`: `["pix","qr","qrcode","asaas","avista","à vista","automatico","automático","recorrente","mensal","anual","trimestral","semestral"]`
- `priority`: maior que a entrada genérica (ex: 90)
- `is_active`: true

### 3. Atualizar memória do projeto

`mem://business/payment-methods-current-state` hoje diz "Credit Card only, PIX/Boleto disabled". Reescrever pra refletir:
- Cartão (todos os planos/períodos, Stripe).
- PIX Automático recorrente via Asaas em todos os períodos, inclusive mensal.
- PIX à vista via Asaas só em trim/sem/anual.
- Boleto e débito off.

Atualizar a linha correspondente em `mem://index.md`.

### 4. Guardrail (curto)

Adicionar nota em `mem://features/recovery/whatsapp-subaccount-recovery.md`: toda mudança em formas de pagamento / preço / planos exige atualizar `recovery_knowledge_base` no mesmo PR — senão o agente mente.

## Não faz parte

- Não mexer no prompt do agente, fluxo do webhook, guards (active user, quiet hours, limite de 3 turnos).
- Não mexer no CheckoutV2.
- Não criar tela admin de KB agora (segue planejada como passo independente).

## Como aplicar

1. `UPDATE` + `INSERT` em `recovery_knowledge_base` via insert tool.
2. `code--write` em `mem://business/payment-methods-current-state.md` + atualizar a linha no `mem://index.md`.
3. Acrescentar parágrafo de guardrail em `mem://features/recovery/whatsapp-subaccount-recovery.md`.
