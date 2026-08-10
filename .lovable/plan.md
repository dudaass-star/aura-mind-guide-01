# Conta Asaas: o que a API mostra e como resolver

## Diagnóstico (verificado agora via API de produção)

A chave `ASAAS_API_KEY` **é válida** — não é problema de credencial:

```text
GET /v3/finance/balance      → 200  { "balance": 289.29 }
GET /v3/customers            → 401  (corpo vazio)
GET /v3/payments             → 401  (corpo vazio)
GET /v3/subscriptions        → 401  (corpo vazio)
GET /v3/pix/addressKeys      → 401  (corpo vazio)
GET /v3/pix/automatic/authorizations → 401 (corpo vazio)
GET /v3/myAccount            → 401  (corpo vazio)
GET /v3/webhooks             → 401  (corpo vazio)
```

Diferença que importa: com uma chave inventada, o Asaas responde
`401 {"code":"invalid_access_token"}`. Com a nossa chave, o 401 vem **sem corpo
nenhum** — é resposta de *permissão negada*, não de chave inválida. E o saldo
(R$ 289,29) responde normalmente, provando que a chave autentica.

Ou seja: a conta continua existindo e com saldo, mas **perdeu autorização para
operar cobranças** (criar/consultar pagamentos, clientes, assinaturas, chaves
Pix). Isso casa exatamente com o que você viu no painel: chave Pix apagada e
botão de nova cobrança cinza.

Data do corte confirmada no nosso banco: o último pagamento Asaas registrado é
**05/08/2026 23:14** — nada depois. Ou seja, o checkout PIX está fora do ar há
5 dias, e a causa é do lado do Asaas, não do nosso código.

Causa mais provável: bloqueio/restrição de conta por compliance (revisão
cadastral, documentação pendente, análise de risco ou suspeita de fraude).
Nesse estado o Asaas mantém saldo e login, remove a chave Pix e bloqueia
emissão de cobranças. Não é algo que se resolva por código ou por gerar nova
chave de API — a liberação é administrativa, do lado deles.

## O que fazer (nesta ordem)

### 1. Você, no painel/atendimento do Asaas
- Entrar em **Minha conta → Status/Pendências** e ver se há documento ou
  informação cadastral pendente. Se houver, enviar — costuma ser o desbloqueio.
- No chatbot, escapar do menu genérico pedindo explicitamente:
  *"conta bloqueada para emissão de cobranças, chave Pix removida, API
  retornando 401 sem corpo — preciso falar com atendimento humano do time de
  compliance"*. Palavras "bloqueio", "compliance" e "atendimento humano"
  costumam escalar.
- Canais alternativos ao chatbot: e-mail **atendimento@asaas.com** e o telefone
  do rodapé do painel. Cite CNPJ, e-mail da conta e a data do corte (05/08).

Se quiser, eu preparo o texto pronto pra colar no atendimento com esses dados.

### 2. Enquanto a conta está bloqueada — não deixar o checkout falhar em silêncio
Hoje o cliente que escolhe PIX no checkout recebe erro genérico, porque toda
chamada morre em 401. Duas mudanças pequenas:

- **Checagem de saúde do gateway**: uma função interna leve testa
  `/finance/balance` (que funciona) e um endpoint de cobrança. Se o de cobrança
  vier 401 sem corpo, marca `system_config.asaas_blocked = true`.
- **Checkout degrada com clareza**: com a flag ligada, `CheckoutV2.tsx` esconde
  o PIX e mostra apenas cartão, com um aviso curto ("PIX temporariamente
  indisponível"). Melhor perder o meio de pagamento do que perder a venda com
  erro sem explicação.
- **Alerta**: quando a flag virar, e-mail pro ADMIN_ALERT_EMAIL — pra você
  saber no mesmo dia, não 5 dias depois.

### 3. Quando a conta for liberada
- Recadastrar a chave Pix no painel (ela foi removida).
- Reconferir os webhooks (`/v3/webhooks`) — bloqueios costumam desativá-los.
- Rodar `asaas-pix-auto-audit` para reconciliar pagamentos e autorizações do
  período de apagão e reativar quem pagou sem o webhook chegar.
- Desligar a flag `asaas_blocked` e refazer o teste ponta a ponta do trial PIX
  de R$ 6,90 (backend já está implantado, só faltou validar em produção).

## Detalhes técnicos
- Sem endpoint público de "status de conta" acessível: `/v3/myAccount` também
  está no bloqueio, então o teste de saúde precisa inferir pelo par
  `balance 200` + `payments 401`.
- Arquivos: nova função `supabase/functions/asaas-health-check/index.ts`
  (cron diário + invocável), leitura da flag em `src/pages/CheckoutV2.tsx`,
  gravação em `system_config`.
- Nada do bloqueio afeta cartão (Stripe) — só o trilho Asaas.
