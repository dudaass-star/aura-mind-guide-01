

## Diagnóstico: O caso Thiago

### Linha do tempo real

**10/abr 22:45** — Thiago acessa o checkout **anual Transformação** (R$ 359,90) → não conclui.
**10/abr 22:46** — Volta e fecha o **mensal Transformação (R$ 79,90/mês)**. Pagamento aprovado, perfil criado, plano `transformacao`, status `active`.

**Então não — ele NÃO entrou pelo trial semanal de R$ 19,90.** Entrou direto no plano mensal cheio, pagou os R$ 79,90 do dia 10/abr.

**10/abr a 21/abr** — Conversas ativas, 2 sessões completas (12/04 no_show, 14/04 ok, 19/04 ok), próximas 4 sessões agendadas até 05/maio.

**22/abr 07:42** — Stripe processa o `invoice.payment_failed` da renovação. **Mas o valor cobrado foi R$ 49,90, não R$ 79,90.** Isso é estranho — parece que o assinante caiu pro plano Direção em algum momento, ou houve troca de plano, ou foi cobrança parcial.

**22/abr 07:42** — Algum job (provavelmente `stripe-webhook` reagindo ao payment_failed) marcou o status como `trial_expired`. **Esse é o bug real.** Um pagamento que falha numa renovação **NÃO deveria virar `trial_expired`** — deveria virar `past_due` (com acesso mantido durante dunning, conforme a regra documentada em `mem://features/subscription/dunning-access-control`).

**22/abr 09:11+** — Thiago manda 16 mensagens cobrando resposta. `aura-agent` retorna HTTP 500 em todas, porque a combinação `plan=transformacao + status=trial_expired` é um estado que o agent não sabe tratar (provavelmente quebra na checagem de limites ou no contexto da sessão).

### Os 3 problemas reais a corrigir

**1. Status errado no Thiago (urgente — usuário pagante sem resposta há 4 dias)**
- Reverter `status: trial_expired → active` no perfil dele.
- Verificar no Stripe se a assinatura está realmente `past_due` ou se já foi cancelada por falha de retry.
- Se `past_due`: manter acesso e mandar e-mail de dunning (link de atualização de cartão).
- Se cancelada: oferecer reativação manual.

**2. Bug no `stripe-webhook`: payment_failed marcando como `trial_expired`**
- Investigar a função `stripe-webhook` e descobrir por que um `invoice.payment_failed` em assinatura mensal (não trial) virou `trial_expired`.
- O comportamento correto: setar `status: past_due`, manter acesso, registrar `payment_failed_at`, disparar dunning por email.
- `trial_expired` só deveria ser aplicado quando o trial semanal de 7 dias termina sem conversão.

**3. Bug no `aura-agent`: crash em estados inesperados**
- O agent está retornando HTTP 500 quando combinação `plan + status` é inconsistente (ex: `transformacao + trial_expired`).
- Adicionar fallback defensivo: se status não permite resposta, mandar mensagem clara ("seu pagamento falhou, atualize aqui") em vez de crashar.
- Logar o stacktrace real (hoje só vemos HTTP 500 genérico).

### Sequência de execução proposta

1. **Corrigir o Thiago agora**: setar `status=active`, mandar mensagem WhatsApp pedindo desculpa pela demora + link de atualização de cartão se a sub estiver past_due.
2. **Auditar quem mais foi afetado**: SQL pra encontrar perfis com `plan IN ('essencial','direcao','transformacao')` e `status='trial_expired'` — provavelmente outros pagantes caíram no mesmo bug.
3. **Patch no `stripe-webhook`**: corrigir a lógica de tratamento de `invoice.payment_failed` pra nunca setar `trial_expired` em assinaturas pós-conversão.
4. **Patch no `aura-agent`**: tratar estados inconsistentes com mensagem amigável + log detalhado em vez de HTTP 500.
5. **Comunicar com o Thiago**: e-mail/WhatsApp pessoal explicando o ocorrido, oferecendo crédito/desconto pelo transtorno (4 dias sem resposta num plano de R$ 79,90).

### Detalhes técnicos a investigar antes do patch

- Qual `subscription.status` está no Stripe agora pro `cus_*` do Thiago (active, past_due, canceled, unpaid).
- Por que a cobrança foi R$ 49,90 e não R$ 79,90 — houve downgrade silencioso? Coupon? Proration?
- Quantos outros perfis estão em `trial_expired` mas têm `plan` pago e `trial_started_at` antigo (>30 dias) — esses são os candidatos a vítimas do mesmo bug.

