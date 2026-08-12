# PIX Automático: fazer o banco mostrar "R$ 29,90/mês" com entrada de R$ 6,90

## O que aconteceu (confirmado)

O mandato que você aprovou no Nubank nasceu como **assinatura de valor variável**. Isso não foi acidente: na Woovi, em Jornada 3, o campo `value` é ao mesmo tempo (1) o valor cobrado na aprovação e (2) o valor dos ciclos. Para cobrar R$ 6,90 na entrada eu tive que criar o mandato com `value = 690` e `minimumValue = 690`, e subir para R$ 29,90 depois da aprovação. A doc da Woovi diz explicitamente que, nesse modo, **não existe teto definido pelo lojista** — quem define é o cliente no app do banco. Daí a tela: "Valor variável / Valor máximo: Não definido".

## Por que no Asaas era possível

O Asaas expõe **dois valores separados** no mesmo consentimento:

```text
POST /pix/automatic/authorizations
  value: 29.90                 -> valor FIXO do mandato (é isso que o banco mostra)
  immediateQrCode.value: 6.90  -> cobrança imediata (cob) embutida no mesmo QR
```

Ou seja: mandato fixo de R$ 29,90 + uma cobrança avulsa de R$ 6,90 dentro do mesmo BR Code composto. O padrão Bacen permite isso — o QR composto é literalmente a junção de um `cob` (pagamento agora) com um `rec` (mandato). A Woovi, na API atual, **não expõe** um campo para o valor da entrada; ela reaproveita o `value` da assinatura.

## Caminhos, em ordem de execução

### 1. Sondar a API da Woovi por um campo de entrada separada (rápido, sem risco)
Testar em sandbox/produção com valores mínimos se `pixRecurringOptions` aceita campos não documentados de entrada (`firstChargeValue`, `entryValue`, `initialValue`, `immediateCharge`, `cob`) junto com `value = 2990` sem `minimumValue`, e inspecionar o mandato resultante (`GET /subscriptions/{id}`) e a `installment` gerada. Se algum campo pegar, é fim de jogo: mandato fixo em R$ 29,90 + entrada R$ 6,90 num scan. Em paralelo, abrir chamado com o suporte técnico da Woovi com exatamente o payload do Asaas acima.

### 2. Compor o QR nós mesmos (a solução real se a Woovi não expor o campo)
O BR Code composto não é mágica da Woovi: é um payload EMV com dois templates:
- campo 26 → URL do `cob` (`qr.woovi.com/qr/v2/cob/...`)
- campo 80 → URL do `rec` (`qr.woovi.com/qr/v2/rec/...`)

Então dá para montar o mesmo efeito do Asaas usando duas chamadas Woovi já disponíveis:
1. `POST /api/v1/charge` → cobrança comum de R$ 6,90 (gera o `cob`).
2. `POST /api/v1/subscriptions` com `journey: ONLY_RECURRENCY` (Jornada 2), `value: 2990`, **sem** `minimumValue`, `dayGenerateCharge` em D+7 → mandato **de valor fixo** (gera o `rec`).
3. Extrair a URL `cob` do EMV da cobrança e a URL `rec` do EMV do mandato e **remontar um único EMV composto** (campos 26 + 80, CRC16-CCITT recalculado), exatamente no formato que a Woovi devolve hoje.

Resultado esperado no app do banco: "Mensal • R$ 29,90 • Todo dia X" com valor fixo, e o pagamento de R$ 6,90 no mesmo scan. Validação obrigatória em teste real de R$ 6,90 antes de qualquer promoção do gateway.

### 3. Recuperar o trilho Asaas (paralelo, alto valor)
O Asaas já fazia isso nativamente e certo — o que quebrou foi credencial (401 em produção desde 05/08). Regularizar a chave/conta Asaas devolve a Jornada 1 sem gambiarra e vira o trilho preferido, com a Woovi como reserva.

### 4. Rede de segurança (só se 1, 2 e 3 falharem)
PIX nasce **fixo em R$ 29,90** (sem promo de entrada), e a promo de R$ 6,90 fica só no cartão. Perde-se a isca no PIX, mas o cliente vê exatamente o valor que será debitado.

## Enquanto isso
- Manter `system_config.pix_gateway` como está (Woovi **não** promovida para o checkout público).
- O mandato variável criado no teste é cancelado, para não deixar autorização sem teto ativa no seu banco.

## Detalhes técnicos
- Composição do EMV: TLV com `26` (merchant account information — `cob`) e `80` (`rec`), `62-05` = `***`, CRC em `6304`. Implementar em `_shared/pix-emv.ts` com testes de round-trip contra os EMVs compostos que a Woovi já devolveu (temos dois exemplos reais em `woovi_subscriptions.raw_payload`), garantindo CRC idêntico antes de usar em produção.
- `criar-pix-recorrente-woovi` passa a ter dois modos: `native` (Jornada 3, atual) e `composed` (cob avulso + mandato fixo Jornada 2 + EMV montado), escolhidos por chave em `system_config`.
- `webhook-woovi` precisa reconhecer a cobrança de entrada avulsa (`OPENPIX:CHARGE_COMPLETED` com `correlationID` da entrada) como o gatilho de liberação de acesso, e `PIX_AUTOMATIC_APPROVED` apenas como confirmação do mandato — sem `PUT /subscriptions/{id}/value`, que deixa de ser necessário no modo composto.
