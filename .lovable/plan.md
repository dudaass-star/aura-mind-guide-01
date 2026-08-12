# PIX Automático: onde entra a cobrança de R$ 6,90

## O que está acontecendo

A tela do Nubank agora mostra exatamente o que queríamos do mandato: **Mensal • Todo dia 12 • R$ 29,90 • Até você cancelar**, com valor fixo. Isso confirma que a correção do mandato funcionou.

O que aparece nessa tela é **só a autorização** (o "contrato" de recorrência). A cobrança de entrada de R$ 6,90 é um recurso separado (uma cobrança Pix comum) que embutimos no mesmo BR Code. Não está confirmado que o app do banco lê e cobra essa parte no mesmo scan: os dados do último teste mostram o mandato criado e ativo, mas **nenhuma cobrança de entrada registrada como paga** no nosso banco. Ou seja: hoje o risco real é o cliente autorizar a recorrência e a entrada de R$ 6,90 nunca ser paga.

## Plano

### 1. Confirmar o comportamento do scan único (primeiro passo, obrigatório)
Concluir um pagamento real com o QR composto atual e verificar, imediatamente após:
- se a autorização foi registrada (mandato ativo);
- se a cobrança de entrada de R$ 6,90 foi liquidada;
- se o webhook ativou o acesso.

Se as duas coisas acontecerem no mesmo scan, o único ajuste necessário é de interface (item 3). Se a entrada não for cobrada, seguimos para o item 2.

### 2. Fluxo em duas etapas no checkout (caso o scan único não cobre a entrada)
Trocar o QR composto por uma sequência explícita e curta, sem sair da tela:
- **Etapa 1 — Pagar R$ 6,90 agora**: QR da cobrança de entrada, com valor visível em destaque.
- **Etapa 2 — Autorizar R$ 29,90/mês**: liberada automaticamente quando a entrada for confirmada, com o QR do mandato fixo (o mesmo que já está correto hoje).
- Acesso liberado ao final da etapa 2; se o cliente parar na etapa 1, entra na régua de recuperação já existente.

Vantagem: o cliente vê os dois valores separados e explicados, e nenhuma das duas partes fica órfã.

### 3. Deixar os valores explícitos na tela (independente do caminho)
No checkout PIX:
- Título com os dois valores: "R$ 6,90 pela primeira semana • depois R$ 29,90/mês".
- Aviso de que a tela do banco mostra apenas a autorização mensal de R$ 29,90, e que a cobrança de hoje é de R$ 6,90.
- Data da primeira cobrança cheia visível (dia 12 do mês seguinte).

### 4. Rede de segurança no backend
- Se o mandato for autorizado mas a entrada de R$ 6,90 não for paga em poucos minutos, tratar como pendência de entrada: reenviar o QR de R$ 6,90 e não deixar acesso ativo sem pagamento.
- Se a entrada for paga e o mandato não for autorizado, manter o acesso da primeira semana e cobrar a autorização por mensagem, sem gerar cobrança duplicada.

## Detalhes técnicos
- Fonte da verdade continua em `woovi_subscriptions` (`creation_mode`, `entry_charge_correlation_id`, `value_cents`, `trial_value_cents`) e `woovi_charges`.
- O compositor EMV (`_shared/pix-emv.ts`) e o payload de valor fixo (`_shared/woovi-subscription-payload.ts`) permanecem; o modo composto passa a ser condicional ao resultado do teste do item 1.
- `criar-pix-recorrente-woovi` passa a poder devolver dois QRs (entrada e mandato) para o modo em duas etapas; `webhook-woovi` correlaciona entrada e mandato e aplica as regras do item 4.
- Nenhuma alteração no trilho de cartão (Stripe) nem no Inter (7 dias grátis).

## Critério de aceite
O cliente enxerga claramente "R$ 6,90 agora + R$ 29,90/mês fixo", paga os R$ 6,90 de fato, autoriza a recorrência fixa, e o acesso só é liberado quando ambas as partes estiverem confirmadas.
