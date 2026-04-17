

## Diagnóstico

A mensagem "Este pagamento não foi concluído porque o banco emissor o recusou" vem do **Stripe**, não do nosso código. É o que o Stripe mostra quando o banco do cliente retorna decline codes como `do_not_honor`, `insufficient_funds`, `card_declined`, `generic_decline`, etc.

Olhando o print:
- 4 falhas no dia 17/abr (R$ 79,90 e R$ 49,90 — os planos Direção e Transformação)
- Cartões diferentes (Master 6055/7052/7362/5726, Visa 6723/1150)
- Todas com a mesma descrição "7 dias de acesso incluídos — a primeira cobran..."

Ou seja: o checkout cria a assinatura no plano semanal (R$ 6,90/9,90/19,90), o usuário passa os 7 dias, e quando o Stripe tenta a primeira cobrança real do plano mensal cheio (49,90/79,90), o banco recusa.

Isso é normal acontecer em alguma proporção (decline rate típico no Brasil é 10-20%), mas precisamos confirmar se está acima do esperado e se nosso fluxo de recovery está funcionando.

## O que preciso investigar antes de agir

1. **Taxa real de decline nos últimos 7-30 dias** — pegar via API do Stripe (`invoices` com status `uncollectible` / `open` vs `paid`) para ver se está fora do normal.
2. **Decline codes mais frequentes** — `do_not_honor` é o vilão clássico no Brasil; `insufficient_funds` é outro caso; `generic_decline` muitas vezes é antifraude do banco. Cada um tem tratamento diferente.
3. **Se o Smart Retries está pegando esses cartões** — segundo a memória `mem://business/stripe-smart-retries-config`, temos Smart Retries ON com 4 tentativas em 3 semanas. Preciso ver se essas falhas viraram `paid` depois.
4. **Se o dunning por e-mail está sendo entregue** — a memória `mem://features/recovery/email-recovery-strategy` diz que dunning vai por e-mail. Confirmar se esses 4 usuários receberam.
5. **Se o `attach-checkout-payment-methods` rodou** — temos a função `mem://technical/stripe/payment-recovery-tool` que reanexa o cartão original do checkout em assinaturas `past_due`.

## Plano de ação

### Passo 1 — Diagnóstico (sem mudar nada ainda)
- Consultar Stripe via `stripe--list_invoices` / `search_stripe_resources` para os últimos 30 dias e levantar:
  - Total de invoices `paid` vs `uncollectible` vs `open`
  - Decline codes agrupados (do_not_honor, insufficient_funds, generic_decline, etc.)
  - Quantos das `past_due` viraram `paid` após Smart Retries
- Verificar no nosso banco (`dunning_attempts`) se os 4 usuários de hoje receberam o e-mail de dunning.

### Passo 2 — Apresentar o relatório real
Mostrar números concretos antes de propor qualquer mudança. Pode ser que esteja dentro do esperado e não precise de nada além de continuar o dunning. Pode ser que precisemos:
- Ativar **3DS adaptativo** para mais bandeiras (já temos `request_three_d_secure: 'any'` no checkout, mas só na primeira cobrança)
- Adicionar **PIX como fallback** no link de dunning (hoje só temos cartão — memória `mem://business/payment-methods-current-state` confirma)
- Reforçar o template de e-mail de dunning para ser mais persuasivo
- Aumentar a janela de Smart Retries

### Passo 3 — Aplicar correção pontual
Depois que o usuário ver os dados e decidir qual caminho seguir, eu implemento. Sem dados reais qualquer mudança agora seria chute.

### Sem mudanças de banco nesse plano
Tudo é leitura via Stripe API + uma query no `dunning_attempts`.

### Resultado esperado
Saber se:
- A taxa de falha está dentro do normal do mercado BR ou anormalmente alta
- O dunning está alcançando esses clientes
- Quais são os 2-3 ajustes de maior impacto (3DS, PIX fallback, template de e-mail, ou ativar customer portal no link de dunning)

Quer que eu rode esse diagnóstico agora?

