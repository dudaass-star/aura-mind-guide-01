# PIX Automático Bacen: por que ainda não está funcionando

## O que os dados mostram (verificado agora)

Desde 28/06 foram criadas **17 autorizações** de PIX Automático:

- **3 ACTIVE** (Leandro, Francisco, Felipe)
- **12 REFUSED** — o banco do pagador recusou o consentimento de recorrência
- **2 CANCELLED**

A implementação está no ar e funciona tecnicamente, mas **quase ninguém consegue autorizar**. A Nina, por exemplo, tentou 6 vezes entre 29 e 30/06: todas REFUSED/CANCELLED — e terminou pagando PIX na mão.

Além disso, **nenhuma cobrança em `asaas_payments` tem `pixAutomaticAuthorizationId`**, nem para os 3 casos ACTIVE. As cobranças de ciclo desses clientes estão como PIX comum `PENDING` (QR manual). Não há um único débito automático confirmado até hoje.

### Por que você não acha essas recusas no painel da Asaas

O que foi recusado **não é cobrança, é autorização** (o consentimento de recorrência do PIX Automático). Por isso não aparece em "Cobranças": não existe cobrança criada quando o consentimento é negado — a Asaas devolve a autorização com `status: REFUSED` e nenhum pagamento é gerado. Nos payloads que temos, essas autorizações têm `payload: null`, `encodedImage: null` e `subscriptionId: null`, ou seja: nem QR chegou a valer, nem assinatura foi criada.

Esses registros vivem no recurso `/pix/automatic/authorizations` da API, que o painel da Asaas não expõe de forma navegável. Nosso banco (`asaas_pix_authorizations`) é hoje a única visão completa — e é exatamente esse ponto cego que o item 1 abaixo resolve.

Dois problemas somados:

1. **Taxa de recusa altíssima na autorização** (12/17). Nos payloads da Asaas, as autorizações voltam com `retryPolicy: "NOT_ALLOWED"` e `minLimitValue: null` — não enviamos esses campos na criação.
2. **A recusa é silenciosa.** O webhook não trata `..._AUTHORIZATION_REFUSED` (cai num fallback genérico) e, para REFUSED, não faz nada: não avisa ninguém, não oferece cartão/PIX avulso, não gera alerta. O cliente simplesmente sai do checkout olhando um QR parado.

## O que fazer

### 1. Instrumentar e enxergar (primeiro passo, sem risco)
- Tratar `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED` explicitamente no `webhook-asaas`, com log de erro e registro do motivo.
- Painel/consulta no Admin: autorizações criadas × ativadas × recusadas por dia, e cobranças de ciclo com/sem vínculo de autorização.
- Conferência direta contra a Asaas: uma leitura read-only de `/pix/automatic/authorizations` para confirmar, na fonte, que os 12 REFUSED constam lá com o mesmo status e capturar o motivo da recusa que a Asaas informa (campo de rejeição por PSP do pagador).

### 2. Recuperar quem é recusado (maior impacto em receita)
- Quando a autorização vira REFUSED, o checkout para de esperar e mostra na hora a alternativa (PIX avulso do mesmo valor ou cartão).
- Recuperação por e-mail/WhatsApp para quem foi recusado e não voltou (12 pessoas nos últimos 30 dias).

### 3. Ajustar a criação da autorização
- Enviar `retryPolicy` permitindo retentativa e `minLimitValue`, para que um débito que falhe possa ser tentado novamente em vez de morrer na primeira falha.
- Confirmar com o suporte da Asaas: (a) por que as autorizações voltam REFUSED com tanta frequência nessa conta; (b) por que as cobranças de ciclo das autorizações ACTIVE saem sem `pixAutomaticAuthorizationId` — sem esse vínculo o débito automático nunca dispara e o cliente sempre recebe QR manual.

### 4. Verificação do dia seguinte
- Rotina diária que compara vencimentos do dia anterior com pagamentos recebidos por débito automático e alerta quando o débito não disparou. É isso que responde de forma definitiva se o PIX Automático funciona nesta conta.

## Decisão que precisa ser sua

Com ~70% de recusa, o PIX Automático como **caminho padrão do mensal** custa vendas. Duas opções:

- **A) Manter como padrão** e implementar itens 1–4 (recupera o refugo, mas o funil segue sangrando até a Asaas responder).
- **B) Rebaixar temporariamente**: mensal volta a oferecer PIX avulso/cartão como padrão, com PIX Automático como opção secundária, até o item 4 comprovar que o débito dispara.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts`: `authStatusMap` sem a chave `..._REFUSED`; bloco de status terminal cobre só CANCELLED/REJECTED/EXPIRED.
- `supabase/functions/criar-pix-recorrente-asaas/index.ts`: `authReqBody` não envia `retryPolicy` nem `minLimitValue`.
- `src/pages/CheckoutV2.tsx`: `pixMode="subscription"` no mensal (~linhas 1019/1032); a tela de QR não reage a autorização recusada.
- Nova rotina de verificação como edge function agendada (cron), lendo `asaas_pix_authorizations` + `asaas_payments`.