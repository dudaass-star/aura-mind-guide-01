# PIX Automático Woovi: recuperação de 30+ dias dentro das regras do Bacen

Fui à documentação da Woovi antes de decidir. O ponto 3 estava certo em levantar o risco, e a análise que você trouxe está correta na parte da janela — mas errada na conclusão de que só sobra o QR avulso. Existe um caminho 100% silencioso e mais longo que os 30 dias, só não é "reciclar a mesma parcela 4x".

## O que a documentação diz (verificado hoje)

- A CobR pode ser criada de **2 a 10 dias antes** da data da cobrança; a Woovi cria sozinha no 4º dia antes, e a criação manual fica disponível **entre 5 e 10 dias antes**. Criar CobR para data passada não existe.
- `retryPolicy: THREE_RETRIES_7_DAYS` (o nosso) já faz **3 tentativas em 7 dias**: D+1, meio do caminho e na expiração — automáticas, silenciosas, sem código nosso.
- `POST /installments/{id}/cobr/retry` só vale **enquanto a CobR está viva**: "só é possível nova retentativa caso a última seja rejeitada", e a CobR vira `REJECTED` definitivo ao atingir a expiração. Depois disso a parcela vira `EXPIRED`.
- As parcelas são **incrementais**: a próxima nasce quando a anterior é paga/cancelada/expira, com a data do ciclo seguinte.

Conclusão prática: reciclar a parcela vencida em D+7, D+14 e D+21 (o que está no ar hoje) vai ser recusado pela API na maioria das voltas. O risco que eu levantei é real e a implementação atual não entrega os 30 dias.

## O desenho correto para o seu objetivo

Seu objetivo — cobrar ao longo do mês inteiro e não encerrar cedo — se resolve por outra alavanca: **o mandato não morre com o ciclo perdido**. Ele continua vivo e cobra de novo no ciclo seguinte, sozinho, com 3 novas tentativas. A recuperação deixa de ser "forçar a parcela velha" e passa a ser "não desligar nada e aproveitar o próximo ciclo".

```text
D0    vencimento          CobR nativa + 3 tentativas ate D+7   silencio, acesso mantido
D+7   parcela expira      nao cancelamos nada, nao avisamos     silencio, acesso mantido
D+20  janela do ciclo 2   criamos a CobR da parcela seguinte    silencio (banco avisa o agendamento)
D+30  cobranca do ciclo 2 + 3 tentativas ate D+37              silencio, acesso mantido
D+37  falhou 2 ciclos     1a e unica conversa: 30% off
D+40  reforco             plano Lite
D+44  encerramento        cancela mandato, corta acesso
```

Isso dá ~37 dias de tentativa real de débito automático — mais do que os 21 dias do cartão — sem nenhuma mensagem de falha e sem pedir autorização nova.

Sobre os pontos da análise que você trouxe:
- **QR avulso obrigatório: não.** Ele só entra quando decidimos falar com o cliente (a oferta em D+37), e aí é intencional: preço menor e possibilidade de pagar por outra conta.
- **Antecipar a parcela seguinte: não fazemos.** Só criamos a CobR do ciclo seguinte dentro da janela legal (5–10 dias antes), na data que já era dele. Sem excesso de frequência.
- **Somar o ciclo perdido ao seguinte: não.** Aumenta o risco de recusa por valor e de o banco pedir confirmação. O ciclo perdido é perda assumida — retenção vale mais que R$ 29,90.

## Mudanças

### 1. Trocar a reciclagem por espera + CobR do ciclo seguinte
- `woovi_cycle_recycle` deixa de retentar a parcela vencida em loop. Passa a: tentar o `retry` **uma vez** enquanto a CobR ainda está viva (janela nativa) e, se recusado/expirado, apenas aguardar.
- Nova etapa que roda na janela do ciclo seguinte (5–10 dias antes do vencimento): cria a CobR manual da parcela `SCHEDULED` com o valor do plano.
- Oferta só depois da falha do 2º ciclo (~D+37), não em D+28.

### 2. Log por tentativa (concordo com a análise)
Cada tentativa/CobR gera **uma linha** em `woovi_charges` com status e payload de erro, em vez de sobrescrever `last_error` do mandato. Sem isso a régua fica cega para saber em que volta está.

### 3. Oferta não pode ir para quem já pagou (crítico, achado no código)
- `woovi_recovery_offer` precisa checar parcela em aberto antes de enviar.
- O caminho de cobrança paga do `webhook-woovi` precisa cancelar as tarefas pendentes de recuperação.

### 4. Acesso e encerramento
- `payment_failed_at` e corte só no encerramento (D+44), como já está.
- Se o cliente derrubar o mandato no app do banco, a auditoria já detecta; a mensagem dela passa a apontar para `/cancelar?t=...&offer=discount_30` em vez do preço cheio em `/v2`.

## Detalhes técnicos

Arquivos: `execute-scheduled-tasks` (casos `woovi_*`), `webhook-woovi` (caminho pago e agendamento), `_shared/woovi.ts` (buscar parcela `SCHEDULED`, criar CobR manual, devolver status para log), `woovi-pix-audit` (link da reautorização).

Sem migração: `woovi_charges` já tem `status`, `raw_payload`, `cycle_index` e `kind` para registrar cada tentativa.

Validação: rodar o executor com um mandato de teste e confirmar nos logs que (a) o retry fora de janela é recusado e tratado, (b) a CobR do ciclo seguinte é criada dentro da janela, (c) pagamento no meio cancela toda a cadência.