# PIX Automático Woovi: recuperação silenciosa de 30 dias

Análise dos 4 pontos, e o plano ajustado a partir deles.

## 1. Cobrar por ~30 dias: sim, e é o coração do plano

Concordo. O mandato já nasce com `retryPolicy: "THREE_RETRIES_7_DAYS"` (`_shared/woovi-subscription-payload.ts`), então cada CobR dá 3 tentativas em 7 dias. Encadeando **4 CobR** na mesma assinatura cobrimos o mês inteiro sem nova autorização:

```text
D0    vencimento    -> CobR 1 (3 tentativas ate D+7)
D+7   rejeitada     -> CobR 2 (ate D+14)
D+14  rejeitada     -> CobR 3 (ate D+21)
D+21  rejeitada     -> CobR 4 (ate D+28)
D+28  esgotou       -> entra oferta
```

Refinamento: se o cliente tem histórico de pagar sempre perto de uma data (5º dia útil, dia 15, dia 30), mirar o vencimento da próxima CobR nessa data em vez de somar 7 dias cegamente. Sobe muito a chance de pegar saldo.

## 2. 30% off no PIX: possível, mas por caminho diferente do cartão

No cartão o desconto é um cupom aplicado à assinatura Stripe. No PIX não existe cupom: o desconto é **valor da cobrança**. Dois caminhos:

- **Reduzir o valor do mandato atual** (`PUT /api/v1/subscriptions/{id}/value`) — já usamos essa chamada hoje para subir do promocional para o cheio depois da aprovação. Descer o valor está dentro do limite autorizado, então não exige nova autorização. Precisa validar na API se aceita valor menor em mandato de valor fixo e como voltar ao cheio depois de N ciclos.
- **Novo mandato com valor promocional** — sempre funciona, mas exige novo scan do cliente.

Plano: tentar o primeiro; se a API recusar, usar o segundo (que é exatamente o que você propõe no item 4).

## 3. Não avisar as falhas: concordo, com uma ressalva

Concordo com a lógica: avisar "sua cobrança falhou" durante a janela de recuperação só lembra o cliente de existir uma assinatura para cancelar — e no PIX Automático o cancelamento é um clique no app do banco. Então:

- **Zero mensagem de falha** durante os ~28 dias de recuperação. As CobR se encadeiam em silêncio.
- **Zero corte de acesso** nesse período: a Aura continua atendendo normalmente. Isso é retenção, não caridade — cliente atendido é cliente que aceita a oferta no fim.
- **Uma única mensagem, no fim da janela**, e enquadrada como oferta ("preparei uma condição pra você seguir"), nunca como cobrança falhada.

A ressalva honesta: o banco do pagador notifica o cliente por conta própria (é regra do Bacen — aviso prévio do débito agendado e da tentativa que não passou). Nosso silêncio reduz o gatilho, mas não garante que ele não veja. Isso reforça o item 4: quando falamos, é melhor chegar com solução na mão.

## 4. Novo QR na hora da oferta: sim, é o desenho certo

Faz total sentido. A conta que autorizou o mandato pode ser justamente a que está sem saldo — e o cliente pode ter outra. Então a oferta (30% off, Lite ou Base) chega como um **novo PIX/novo mandato**, permitindo escolher outra conta. Cuidados obrigatórios:

- Cancelar o mandato antigo **somente depois** que o novo for aprovado e a entrada paga, para não perder cobertura nem cobrar duas vezes.
- Vincular os dois via `replaced_by_subscription_id` em `woovi_subscriptions` (campo já existe), preservando o histórico do cliente.
- Se o cliente pagar o ciclo antigo no meio do processo, cancelar a oferta e seguir no mandato original.

## Régua final

```text
D0..D+28   4 CobR encadeadas, 3 tentativas cada, em SILENCIO
           acesso mantido, Aura atendendo normalmente
D+28       1a e unica mensagem: oferta com novo QR
           30% off (se a API permitir) ou plano Lite
D+31       reforco leve da oferta (ultima mensagem)
D+35       cancela mandato antigo, aplica tier Base (acesso reduzido permanente)
```

Base continua como rede final: o cliente não sai, fica em acesso mínimo e pode voltar depois.

## Detalhes técnicos

- **Validar na API da Woovi antes de codar**: (a) criar nova CobR em assinatura `PIX_RECURRING` ativa e o controle do vencimento; (b) `PUT /subscriptions/{id}/value` aceitando valor menor em mandato fixo. Os dois definem se o caminho principal roda ou se caímos no fallback de novo mandato.
- `supabase/functions/webhook-woovi/index.ts`: em `handleUnpaidCycle`, separar `TRY_REJECTED` (tentativa individual — ignorar, a Woovi ainda retenta) de `REJECTED` (fim da CobR — agendar a próxima). Hoje ambos caem no mesmo bloco por `UNPAID_CHARGE_STATUSES`, e o bloco dispara aviso imediato + D+2/D+4/D+7 — esses avisos saem.
- Novo `task_type` `woovi_cycle_recycle` em `execute-scheduled-tasks`: confere fatura em aberto e mandato ativo, cria a próxima CobR, incrementa o contador (máximo 4) e agenda o passo seguinte. No 4º, agenda a oferta.
- `_shared/dunning-whatsapp.ts`: para o trilho Woovi, escada reduzida a **oferta + reforço**, sem os 2 avisos genéricos. Texto novo exige template aprovado no Twilio.
- `criar-pix-recorrente-woovi`: aceitar `mode: "offer"` com valor promocional (30% off ou Lite), reaproveitando o fluxo de reautorização já existente e gravando `replaced_by_subscription_id`.
- Acesso: garantir que `payment_failed_at` no `profiles` não corte a experiência durante a janela — hoje ele é escrito na primeira falha. Passa a marcar só no fim dos 28 dias.
- `woovi_charges`: contador de reciclo no registro do ciclo, sem tabela nova; `woovi_subscriptions.last_error` segue como trilha de estado.
- Validação: simular `PIX_AUTOMATIC_COBR_REJECTED` e conferir encadeamento das 4 CobR, ausência de mensagens e disparo único da oferta no fim.