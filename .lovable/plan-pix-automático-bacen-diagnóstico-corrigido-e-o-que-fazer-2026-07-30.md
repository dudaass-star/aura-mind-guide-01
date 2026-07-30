# PIX Automático Bacen: diagnóstico corrigido e o que fazer

## Sua hipótese está quase certa — e os dados apontam algo mais simples

Você não acha essas recusas na Asaas porque **não são cobranças, são autorizações** (o consentimento de recorrência). Quando o consentimento não se completa, nenhuma cobrança é criada — logo, nada aparece em "Cobranças". Esses registros vivem em `/pix/automatic/authorizations`, que o painel não expõe de forma navegável. Nosso `asaas_pix_authorizations` é hoje a única visão completa.

E o padrão temporal mata a dúvida: **todas as 12 REFUSED foram marcadas exatamente ~30 minutos após a criação** (30:10, 30:19, 30:20, 30:28, 30:38, 30:49, 30:59, 31:01…). Trinta minutos é exatamente o TTL do nosso QR (`expirationSeconds = 1800`). Ou seja: não é o banco negando o débito automático — é o **QR expirando sem que o cliente conclua**. O cliente abriu o app, viu a tela de autorização de recorrência (a "caixinha") e não finalizou: desistiu, travou na dúvida, ou nem abriu.

As 3 que deram certo foram concluídas em 2, 6 e 117 minutos. Autorizações que o cliente completa, completam rápido.

A Nina é o caso extremo: 6 tentativas em dois dias, todas expiradas, e no fim pagou um PIX manual.

Então o problema real é **conversão da tela de autorização no app do banco**, não capacidade técnica.

## O segundo problema, que continua de pé

Para as 3 autorizações ACTIVE, as cobranças do ciclo seguinte estão como PIX comum `PENDING`, **sem `pixAutomaticAuthorizationId**`, e há duas já `OVERDUE` (Leandro 06/07, Felipe 30/06, Francisco 02/07). Nenhum débito automático confirmado até hoje: os únicos recebidos foram os pagamentos iniciais.

Duas cobranças vencem agora e servem de teste: **Felipe 30/07** (`pay_tf8bevjfskg3r6rq`) e **Francisco 02/08** (`pay_qm7po4aowq9lh8o0`).

## O que fazer (mantendo PIX Automático como caminho recorrente — sem avulso)

### 1. Converter a tela de autorização no app do banco

Aqui está o ganho maior: 12 pessoas chegaram ao QR e não concluíram.

- Reescrever a instrução na tela de QR: dizer explicitamente que, além de pagar, o app do banco vai pedir **autorização da cobrança automática mensal** e que é preciso confirmar essa etapa — com o valor, a frequência e o "pode cancelar quando quiser" visíveis.
- Estados de acompanhamento na própria tela: "aguardando autorização" → "autorizado" → "expirou". Hoje a tela fica parada e o cliente não sabe se deu certo.
- Aumentar o TTL do QR (de 30 min para o máximo que a Asaas aceitar) e oferecer botão "gerar novo QR" quando expirar, em vez de deixar o cliente sem saída.

### 2. Não perder quem expirou

- Tratar `..._AUTHORIZATION_REFUSED`/expirado explicitamente no `webhook-asaas`, com log de erro e registro do motivo.
- Recuperação por e-mail/WhatsApp para quem expirou e não voltou (12 pessoas em 30 dias), com link para retomar o **mesmo PIX recorrente** e uma explicação curta da etapa de autorização. No pix podemos ofertar, trimestral, semestral ou Anual. 

### 3. Fazer o débito automático realmente disparar

- Enviar `retryPolicy` com retentativa e `minLimitValue` na criação da autorização, para que uma falha de débito seja tentada de novo.
- Investigar por que as cobranças de ciclo das 3 autorizações ACTIVE nascem sem `pixAutomaticAuthorizationId` (e por isso viram QR manual e vencem). Confirmar com o suporte da Asaas se o vínculo deve ser criado pela assinatura gerada pela autorização (`paymentCreationMode: SUBSCRIPTION`) e o que está impedindo.

### 4. Verificação do dia seguinte

- Rotina diária comparando vencimentos do dia anterior com recebimentos por débito automático, alertando quando o débito não disparou. Começando por Felipe (30/07) e Francisco (02/08) — são o teste real.

## Ordem sugerida

3 e 4 primeiro (sem débito automático funcionando, converter mais autorizações só empurra o problema para o ciclo 2), depois 1 e 2 para elevar a taxa de autorização.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts`: `authStatusMap` sem a chave `..._REFUSED`; bloco de status terminal cobre só CANCELLED/REJECTED/EXPIRED (REFUSED entra pelo fallback e não dispara nada).
- `supabase/functions/criar-pix-recorrente-asaas/index.ts`: `qrTtlSeconds = 30 * 60` (bate exatamente com o delta das 12 recusas); `authReqBody` não envia `retryPolicy` nem `minLimitValue`.
- `src/pages/CheckoutV2.tsx`: `pixMode="subscription"` no mensal (~linhas 1019/1032); a tela de QR não faz polling de status nem reage a expiração.
- Leitura read-only de `/pix/automatic/authorizations` na Asaas para confirmar status e motivo na fonte.
- Nova rotina de verificação como edge function agendada (cron), lendo `asaas_pix_authorizations` + `asaas_payments`.