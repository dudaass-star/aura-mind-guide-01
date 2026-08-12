---
name: Recuperação silenciosa PIX Automático Woovi (~37 dias)
description: Régua de recuperação do PIX Automático Woovi respeitando a janela Bacen de CobR (2-10 dias antes), com acesso mantido e oferta só após 2 ciclos falharem
type: feature
---
Objetivo: cobrar ao longo do mês inteiro sem avisar falha e sem cortar acesso (paridade com os ~21 dias de Smart Retries do cartão).

Regras da Woovi/Bacen (verificadas na doc):
- CobR só pode ser criada de 2 a 10 dias ANTES do vencimento. A Woovi cria sozinha no 4º dia antes; criação manual fica entre o 5º e o 10º. **Não existe CobR retroativa.**
- `retryPolicy: THREE_RETRIES_7_DAYS` faz 3 tentativas em 7 dias (D+1, meio, expiração).
- `POST /installments/{id}/cobr/retry` só vale enquanto a CobR está viva; ao expirar ela vira REJECTED e a parcela EXPIRED.
- Parcelas são incrementais: a próxima nasce quando a anterior é paga/cancelada/expira.

Régua implementada:
1. D0-D+7: 3 retries nativos + 1 retry oportunista nosso. Silêncio total, acesso mantido, sem `payment_failed_at`.
2. Janela do ciclo seguinte (mira 8 dias antes do vencimento): tarefa `woovi_next_cycle_cobr` cria a CobR manual do próximo ciclo. Fora da janela (>10d) ela se reagenda.
3. ~D+30: cobrança do ciclo 2 + 3 retries nativos até ~D+37. Ainda em silêncio.
4. D+37: `woovi_recovery_offer` passo 1 (30% off) → D+40 passo 2 (Lite) → D+44 `woovi_recovery_final` cancela mandato e corta acesso.

Decisões: nunca somar o ciclo perdido ao seguinte (risco de recusa por valor/nova autorização); nunca antecipar parcela; ciclo perdido é perda assumida. QR avulso só na oferta (permite pagar de outra conta).

Segurança: pagamento entrando (webhook) e qualquer tarefa da cadência cancelam todas as tarefas `woovi_*` pendentes — oferta nunca vai pra quem regularizou. Cada tentativa gera uma linha em `woovi_charges` com `kind='recovery_attempt'` (não sobrescreve `last_error`).
