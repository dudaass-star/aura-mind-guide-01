# PIX Automático composto: validado nos dois bancos

## Comportamento confirmado

O QR composto (cobrança de entrada R$ 6,90 + mandato mensal fixo R$ 29,90) funciona nos dois bancos testados — só a **ordem de exibição muda**:

```text
Banco do Brasil   -> uma tela só: "1º pagamento R$ 6,90 hoje" + "Pix Automático R$ 29,90, mensal dia 12"
Nubank            -> tela 1: autorização R$ 29,90/mês fixo
                     tela 2: débito de R$ 6,90 ("valor pré-definido por JUBI LTDA")
```

Ou seja: cada banco renderiza o arranjo do Pix Automático do seu jeito, mas os dois entregam o mesmo resultado — R$ 6,90 agora + R$ 29,90/mês fixo, com uma única leitura de QR. Nada mais a corrigir no payload nem no compositor EMV.

## Plano

### 1. Copy do checkout à prova de banco
No checkout PIX:
- Valores em destaque: "R$ 6,90 hoje • depois R$ 29,90/mês, cancela quando quiser".
- Nota curta abaixo do QR: "Seu banco pode mostrar primeiro a autorização de R$ 29,90/mês e, na tela seguinte, o pagamento de R$ 6,90. É o mesmo Pix — basta confirmar as duas etapas."
- Data da primeira cobrança cheia visível (dia 12 do mês seguinte).
- Instrução explícita de não fechar o app antes de concluir as duas telas.

### 2. Rede de segurança para conclusão parcial
Como o cliente pode abandonar entre as duas telas do banco:
- Mandato autorizado sem a entrada paga em poucos minutos: reenviar o QR de R$ 6,90 pelo WhatsApp e não liberar acesso sem pagamento confirmado.
- Entrada paga sem mandato autorizado: liberar a primeira semana e pedir a autorização por mensagem, sem duplicar cobrança.
- Nenhuma cobrança nem mandato órfão em caso de falha parcial.

### 3. Rastrear qual banco fez o quê
- Persistir a cobrança de entrada e o resultado da autorização com o banco pagador informado pelo webhook, para medir conclusão por instituição e detectar bancos problemáticos cedo.

### 4. Teste financeiro real e liberação
- Concluir um pagamento real completo (BB e Nubank), verificando em cada caso: entrada liquidada, mandato ativo, acesso liberado, próxima cobrança agendada em D+30.
- Só então habilitar o trilho Woovi como opção PIX padrão no checkout, mantendo o gate de saúde já existente.

## Detalhes técnicos
- Compositor EMV (`_shared/pix-emv.ts`) e payload de valor fixo (`_shared/woovi-subscription-payload.ts`) permanecem como estão — já validados em campo.
- `webhook-woovi`: correlaciona entrada e mandato, persiste a cobrança de entrada em `woovi_charges` (hoje só existe o vínculo em `woovi_subscriptions.entry_charge_correlation_id`) e aplica as regras do item 2.
- Alterações de interface isoladas no checkout PIX; sem impacto no trilho de cartão (Stripe) nem no Inter (7 dias grátis).

## Critério de aceite
Um scan único, em qualquer banco, resulta em R$ 6,90 pago, mandato mensal fixo de R$ 29,90 ativo e acesso liberado — e, quando o cliente para no meio das duas telas, o sistema detecta e resolve automaticamente.
